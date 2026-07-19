import { create } from 'zustand';

import { sha256Hex } from '../lib/markdown/hash';
import { parseMarkdown } from '../lib/markdown/parse';
import { extractTitle, normalizeTitle, titleFromPath } from '../lib/markdown/title';
import { decideExternalChange } from '../lib/notes/externalChange';
import { NoteSaveScheduler } from '../lib/notes/saveScheduler';
import {
  isTauri,
  onVaultFsEvent,
  vaultApi,
  type FsEventPayload,
  type TreeEntry,
  type VaultInfo,
} from '../lib/tauri';

export type EditorMode = 'markdown' | 'rich';
export type EditorView = 'markdown' | 'rich' | 'split';
export type ActivityView = 'vault' | 'search' | 'graph';
export type SettingsTab = 'general' | 'editor' | 'providers';

export interface NoteState {
  content: string;
  /**
   * The document's H1 title (first line). Seeded from the file name at
   * creation; afterwards it may diverge — editing it never renames the file.
   */
  title: string;
  savedHash: string | null;
  dirty: boolean;
  saving: boolean;
  /** Milliseconds since epoch of the last known on-disk modification. */
  modifiedMs: number | null;
  /** Populated when the disk changed under unsaved local edits. */
  external: { content: string; hash: string } | null;
  /**
   * Bumped whenever content is replaced from outside the active editor
   * (load, reload, completed save). Editors resynchronize on this signal,
   * never on live keystrokes from the other view.
   */
  syncVersion: number;
  lastEditPane: string | null;
}

/** An editor group (VSCode-style): its own tabs, one view per tab. */
export interface PaneState {
  id: string;
  tabs: string[];
  active: string | null;
  views: Record<string, EditorView>;
  /** Rich-column percentage of the in-group split view (25–75). */
  splitPct: number;
}

export interface LatticeSettings {
  defaultMode: EditorMode;
  lineNumbers: boolean;
}

interface WorkspaceState {
  tauriAvailable: boolean;
  booted: boolean;
  vault: VaultInfo | null;
  vaultError: string | null;
  tree: TreeEntry[];
  view: ActivityView;
  panes: PaneState[];
  focusedPane: string;
  splitRatio: number;
  notes: Record<string, NoteState>;
  settings: LatticeSettings;
  settingsOpen: boolean;
  settingsTab: SettingsTab;
  creating: 'note' | 'folder' | null;
  compare: { relPath: string } | null;
  cursor: { line: number; col: number } | null;

  boot: () => Promise<void>;
  openVaultAt: (path: string) => Promise<void>;
  createVaultAt: (path: string) => Promise<void>;
  refreshTree: () => Promise<void>;
  setView: (view: ActivityView) => void;
  setFocusedPane: (paneId: string) => void;
  openNote: (paneId: string, relPath: string) => Promise<void>;
  closeTab: (paneId: string, relPath: string) => void;
  activateTab: (paneId: string, relPath: string) => void;
  setNoteView: (paneId: string, relPath: string, view: EditorView) => void;
  setSplitPct: (paneId: string, pct: number) => void;
  moveTab: (relPath: string, fromPane: string | null, toPane: string, beforePath?: string) => void;
  openSideBySide: (relPath: string, fromPane: string | null) => void;
  editNote: (paneId: string, relPath: string, content: string) => void;
  flushNote: (relPath: string) => Promise<void>;
  setSplitRatio: (ratio: number) => void;
  startCreate: (kind: 'note' | 'folder') => void;
  cancelCreate: () => void;
  createNote: (dirRelPath: string, name: string) => Promise<string | null>;
  createFolder: (dirRelPath: string, name: string) => Promise<void>;
  renameEntry: (fromRelPath: string, toRelPath: string) => Promise<void>;
  resolveExternal: (relPath: string, choice: 'reload' | 'keep' | 'compare') => void;
  closeCompare: () => void;
  updateSettings: (partial: Partial<LatticeSettings>) => void;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setCursor: (cursor: { line: number; col: number } | null) => void;
}

const LAYOUT_DEBOUNCE_MS = 500;
const SAVE_DEBOUNCE_MS = 800;
const MAX_PANES = 2;

let layoutTimer: ReturnType<typeof setTimeout> | null = null;
let paneCounter = 0;

export const useWorkspaceStore = create<WorkspaceState>((set, get) => {
  const scheduler = new NoteSaveScheduler({
    delayMs: SAVE_DEBOUNCE_MS,
    save: (path, content, baseHash) => vaultApi.writeNote(path, content, baseHash),
    onSaved: (path, savedContent, hash) => {
      const note = get().notes[path];
      if (!note) return;
      const stillDirty = note.content !== savedContent;
      patchNote(path, {
        savedHash: hash,
        dirty: stillDirty,
        saving: scheduler.hasPending(path),
        modifiedMs: Date.now(),
        syncVersion: note.syncVersion + 1,
      });
      vaultApi
        .writeBlockCache(path, hash, JSON.stringify(parseMarkdown(savedContent)))
        .catch(() => undefined);
    },
    onConflict: (path, _localContent, disk) => {
      patchNote(path, {
        saving: false,
        external: { content: disk.content, hash: disk.hash },
      });
    },
    onError: (path) => {
      patchNote(path, { saving: false });
    },
  });

  function patchNote(relPath: string, patch: Partial<NoteState>): void {
    set((state) => {
      const note = state.notes[relPath];
      if (!note) return state;
      return { notes: { ...state.notes, [relPath]: { ...note, ...patch } } };
    });
  }

  /** Drop empty panes (min 1 kept), clamp focus, prune orphaned note state. */
  function normalizePanes(panes: PaneState[], focused: string): Partial<WorkspaceState> {
    let result = panes;
    if (result.length > 1) {
      result = result.filter((pane) => pane.tabs.length > 0);
    }
    if (result.length === 0) {
      result = [emptyPane()];
    }
    const focusedPane = result.some((pane) => pane.id === focused) ? focused : result[0].id;
    const open = new Set(result.flatMap((pane) => pane.tabs));
    const notes: Record<string, NoteState> = {};
    for (const [path, note] of Object.entries(get().notes)) {
      if (open.has(path) || note.dirty) {
        notes[path] = note;
      } else {
        scheduler.discard(path);
      }
    }
    return { panes: result, focusedPane, notes };
  }

  function persistLayoutSoon(): void {
    if (!get().tauriAvailable || !get().vault) return;
    if (layoutTimer) clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => {
      const { panes, splitRatio, view } = get();
      const layout = {
        view,
        splitRatio,
        panes: panes.map((pane) => ({
          id: pane.id,
          tabs: pane.tabs,
          active: pane.active,
          views: pane.views,
          splitPct: pane.splitPct,
        })),
      };
      vaultApi.saveWorkspaceState(JSON.stringify(layout)).catch(() => undefined);
    }, LAYOUT_DEBOUNCE_MS);
  }

  async function loadNote(relPath: string): Promise<void> {
    if (get().notes[relPath]) return;
    const file = await vaultApi.readNote(relPath);
    set((state) => ({
      notes: {
        ...state.notes,
        [relPath]: {
          content: file.content,
          title: extractTitle(file.content) ?? titleFromPath(relPath),
          savedHash: file.hash,
          dirty: false,
          saving: false,
          modifiedMs: file.modifiedMs ?? null,
          external: null,
          syncVersion: 0,
          lastEditPane: null,
        },
      },
    }));
  }

  function noteOpenAnywhere(relPath: string, panes: PaneState[]): boolean {
    return panes.some((pane) => pane.tabs.includes(relPath));
  }

  async function handleFsEvent(payload: FsEventPayload): Promise<void> {
    await get().refreshTree();
    for (const relPath of payload.relPaths) {
      if (!relPath.endsWith('.md')) continue;
      const note = get().notes[relPath];
      if (!note || !noteOpenAnywhere(relPath, get().panes)) continue;

      if (payload.kind === 'removed') {
        // Keep the buffer; the user still has the content and can re-save.
        continue;
      }
      let file;
      try {
        file = await vaultApi.readNote(relPath);
      } catch {
        continue;
      }
      const decision = decideExternalChange({
        isDirty: note.dirty,
        externalHash: file.hash,
        lastKnownHash: note.savedHash,
      });
      if (decision === 'reload') {
        patchNote(relPath, {
          content: file.content,
          title: extractTitle(file.content) ?? note.title,
          savedHash: file.hash,
          dirty: false,
          modifiedMs: file.modifiedMs ?? Date.now(),
          external: null,
          syncVersion: get().notes[relPath].syncVersion + 1,
        });
      } else if (decision === 'review') {
        patchNote(relPath, { external: { content: file.content, hash: file.hash } });
      }
    }
  }

  async function restoreLayout(): Promise<void> {
    let layoutJson: string | null = null;
    try {
      layoutJson = await vaultApi.loadWorkspaceState();
    } catch {
      return;
    }
    if (!layoutJson) return;
    try {
      const layout = JSON.parse(layoutJson) as {
        view?: string;
        splitRatio?: number;
        panes?: Array<Partial<PaneState> & { modes?: Record<string, string>; tabs?: string[] }>;
      };
      const panes: PaneState[] = [];
      for (const saved of (layout.panes ?? []).slice(0, MAX_PANES)) {
        const tabs: string[] = [];
        for (const relPath of saved.tabs ?? []) {
          try {
            await loadNote(relPath);
            tabs.push(relPath);
          } catch {
            // The file disappeared between sessions; drop its tab.
          }
        }
        if (tabs.length === 0 && panes.length > 0) continue;
        // Older layouts stored per-tab "modes"; both value sets are valid views.
        const savedViews = saved.views ?? saved.modes ?? {};
        const views: Record<string, EditorView> = {};
        for (const tab of tabs) {
          const view = savedViews[tab];
          views[tab] = view === 'markdown' || view === 'rich' || view === 'split' ? view : 'rich';
        }
        panes.push({
          id: saved.id ?? emptyPane().id,
          tabs,
          active: saved.active && tabs.includes(saved.active) ? saved.active : (tabs[0] ?? null),
          views,
          splitPct: clampPct(saved.splitPct ?? 50),
        });
      }
      const view = layout.view === 'search' || layout.view === 'graph' ? layout.view : 'vault';
      set({
        view,
        splitRatio: clampRatio(layout.splitRatio ?? 0.5),
        ...normalizePanes(panes.length > 0 ? panes : [emptyPane()], panes[0]?.id ?? ''),
      });
    } catch {
      set({ panes: [emptyPane()] });
    }
  }

  return {
    tauriAvailable: isTauri(),
    booted: false,
    vault: null,
    vaultError: null,
    tree: [],
    view: 'vault',
    panes: [emptyPane()],
    focusedPane: '',
    splitRatio: 0.5,
    notes: {},
    settings: { defaultMode: 'rich', lineNumbers: true },
    settingsOpen: false,
    settingsTab: 'general',
    creating: null,
    compare: null,
    cursor: null,

    boot: async () => {
      if (get().booted) return;
      set((state) => ({ booted: true, focusedPane: state.panes[0].id }));
      if (!get().tauriAvailable) return;
      await onVaultFsEvent((payload) => {
        void handleFsEvent(payload);
      });
      try {
        const last = await vaultApi.getLastVault();
        if (last) {
          await get().openVaultAt(last);
        }
      } catch {
        // No previous vault; onboarding takes over.
      }
    },

    openVaultAt: async (path: string) => {
      try {
        const vault = await vaultApi.openVault(path);
        const pane = emptyPane();
        set({ vault, vaultError: null, notes: {}, panes: [pane], focusedPane: pane.id });
        const settings = await vaultApi.readSettings().catch(() => ({}));
        set((state) => ({
          settings: { ...state.settings, ...normalizeSettings(settings) },
        }));
        await get().refreshTree();
        await restoreLayout();
      } catch (error) {
        set({ vaultError: String(error) });
      }
    },

    createVaultAt: async (path: string) => {
      try {
        const vault = await vaultApi.createVault(path);
        const pane = emptyPane();
        set({ vault, vaultError: null, notes: {}, panes: [pane], focusedPane: pane.id });
        await get().refreshTree();
      } catch (error) {
        set({ vaultError: String(error) });
      }
    },

    refreshTree: async () => {
      if (!get().vault) return;
      try {
        const tree = await vaultApi.listTree();
        set({ tree });
      } catch {
        // Transient watcher races are fine; the next event refreshes again.
      }
    },

    setView: (view) => {
      set({ view });
      persistLayoutSoon();
    },

    setFocusedPane: (paneId) => {
      if (get().panes.some((pane) => pane.id === paneId)) {
        set({ focusedPane: paneId });
      }
    },

    openNote: async (paneId, relPath) => {
      await loadNote(relPath);
      set((state) => ({
        panes: state.panes.map((pane) => {
          if (pane.id !== paneId) return pane;
          const tabs = pane.tabs.includes(relPath) ? pane.tabs : [...pane.tabs, relPath];
          return {
            ...pane,
            tabs,
            active: relPath,
            views: {
              ...pane.views,
              [relPath]: pane.views[relPath] ?? state.settings.defaultMode,
            },
          };
        }),
        focusedPane: paneId,
      }));
      persistLayoutSoon();
    },

    closeTab: (paneId, relPath) => {
      void scheduler.flush(relPath);
      set((state) => {
        const panes = state.panes.map((pane) => {
          if (pane.id !== paneId) return pane;
          const tabs = pane.tabs.filter((tab) => tab !== relPath);
          const views = { ...pane.views };
          delete views[relPath];
          return {
            ...pane,
            tabs,
            views,
            active: pane.active === relPath ? (tabs[tabs.length - 1] ?? null) : pane.active,
          };
        });
        return normalizePanes(panes, state.focusedPane);
      });
      persistLayoutSoon();
    },

    activateTab: (paneId, relPath) => {
      set((state) => ({
        panes: state.panes.map((pane) =>
          pane.id === paneId && pane.tabs.includes(relPath) ? { ...pane, active: relPath } : pane,
        ),
        focusedPane: paneId,
      }));
      persistLayoutSoon();
    },

    setNoteView: (paneId, relPath, view) => {
      set((state) => ({
        panes: state.panes.map((pane) =>
          pane.id === paneId ? { ...pane, views: { ...pane.views, [relPath]: view } } : pane,
        ),
        focusedPane: paneId,
      }));
      persistLayoutSoon();
    },

    setSplitPct: (paneId, pct) => {
      set((state) => ({
        panes: state.panes.map((pane) =>
          pane.id === paneId ? { ...pane, splitPct: clampPct(pct) } : pane,
        ),
      }));
      persistLayoutSoon();
    },

    moveTab: (relPath, fromPane, toPane, beforePath) => {
      set((state) => {
        const panes = state.panes.map((pane) => ({
          ...pane,
          tabs: [...pane.tabs],
          views: { ...pane.views },
        }));
        const source = fromPane ? panes.find((pane) => pane.id === fromPane) : undefined;
        const sourceView = source?.views[relPath];
        if (source && (source.id !== toPane || beforePath)) {
          source.tabs = source.tabs.filter((tab) => tab !== relPath);
          if (source.id !== toPane) {
            delete source.views[relPath];
            if (source.active === relPath) {
              source.active = source.tabs[source.tabs.length - 1] ?? null;
            }
          }
        }
        const target = panes.find((pane) => pane.id === toPane);
        if (!target) return state;
        if (!target.tabs.includes(relPath)) {
          const index = beforePath ? target.tabs.indexOf(beforePath) : -1;
          if (index >= 0) {
            target.tabs.splice(index, 0, relPath);
          } else {
            target.tabs.push(relPath);
          }
        }
        target.active = relPath;
        target.views[relPath] = target.views[relPath] ?? sourceView ?? state.settings.defaultMode;
        return normalizePanes(panes, target.id);
      });
      persistLayoutSoon();
    },

    openSideBySide: (relPath, fromPane) => {
      const state = get();
      if (state.panes.length >= MAX_PANES) {
        const target = state.panes[state.panes.length - 1];
        state.moveTab(relPath, fromPane, target.id);
        return;
      }
      const pane = emptyPane();
      pane.tabs = [relPath];
      pane.active = relPath;
      pane.views[relPath] = state.settings.defaultMode;
      set((current) => {
        const panes = current.panes.map((existing) => {
          if (fromPane && existing.id === fromPane) {
            const tabs = existing.tabs.filter((tab) => tab !== relPath);
            const views = { ...existing.views };
            delete views[relPath];
            return {
              ...existing,
              tabs,
              views,
              active:
                existing.active === relPath ? (tabs[tabs.length - 1] ?? null) : existing.active,
            };
          }
          return existing;
        });
        return normalizePanes([...panes, pane], pane.id);
      });
      persistLayoutSoon();
    },

    editNote: (paneId, relPath, content) => {
      const note = get().notes[relPath];
      if (!note) return;
      // Title invariant: the first line is always an H1. The live editor
      // buffer may transiently deviate; the stored/saved content never does.
      const normalized = normalizeTitle(content, note.title);
      if (note.content === normalized) return;
      patchNote(relPath, {
        content: normalized,
        title: extractTitle(normalized) ?? note.title,
        dirty: true,
        saving: true,
        lastEditPane: paneId,
      });
      scheduler.schedule(relPath, normalized, note.savedHash);
    },

    flushNote: async (relPath) => {
      await scheduler.flush(relPath);
    },

    setSplitRatio: (ratio) => {
      set({ splitRatio: clampRatio(ratio) });
      persistLayoutSoon();
    },

    startCreate: (kind) => set({ creating: kind, view: 'vault' }),
    cancelCreate: () => set({ creating: null }),

    createNote: async (dirRelPath, name) => {
      const fileName = name.endsWith('.md') ? name : `${name}.md`;
      const relPath = dirRelPath ? `${dirRelPath}/${fileName}` : fileName;
      try {
        await vaultApi.createNote(relPath);
        await get().refreshTree();
        return relPath;
      } catch (error) {
        set({ vaultError: String(error) });
        return null;
      }
    },

    createFolder: async (dirRelPath, name) => {
      const relPath = dirRelPath ? `${dirRelPath}/${name}` : name;
      try {
        await vaultApi.createFolder(relPath);
        await get().refreshTree();
      } catch (error) {
        set({ vaultError: String(error) });
      }
    },

    renameEntry: async (fromRelPath, toRelPath) => {
      try {
        await vaultApi.renameEntry(fromRelPath, toRelPath);
      } catch (error) {
        set({ vaultError: String(error) });
        return;
      }
      set((state) => {
        const notes: Record<string, NoteState> = {};
        for (const [path, note] of Object.entries(state.notes)) {
          notes[renamePath(path, fromRelPath, toRelPath)] = note;
        }
        const panes = state.panes.map((pane) => ({
          ...pane,
          tabs: pane.tabs.map((tab) => renamePath(tab, fromRelPath, toRelPath)),
          active: pane.active ? renamePath(pane.active, fromRelPath, toRelPath) : null,
          views: Object.fromEntries(
            Object.entries(pane.views).map(([path, view]) => [
              renamePath(path, fromRelPath, toRelPath),
              view,
            ]),
          ),
        }));
        return { notes, panes };
      });
      await get().refreshTree();
      persistLayoutSoon();
    },

    resolveExternal: (relPath, choice) => {
      const note = get().notes[relPath];
      if (!note?.external) return;
      if (choice === 'reload') {
        patchNote(relPath, {
          content: note.external.content,
          title: extractTitle(note.external.content) ?? note.title,
          savedHash: note.external.hash,
          dirty: false,
          saving: false,
          modifiedMs: Date.now(),
          external: null,
          syncVersion: note.syncVersion + 1,
        });
        scheduler.discard(relPath);
      } else if (choice === 'keep') {
        // Deliberately overwrite the on-disk version with the local buffer.
        patchNote(relPath, { external: null, saving: true });
        scheduler.discard(relPath);
        scheduler.schedule(relPath, note.content, note.external.hash);
      } else {
        set({ compare: { relPath } });
      }
    },

    closeCompare: () => set({ compare: null }),

    updateSettings: (partial) => {
      set((state) => ({ settings: { ...state.settings, ...partial } }));
      const settings = get().settings;
      if (get().tauriAvailable && get().vault) {
        vaultApi
          .writeSettings({
            defaultMode: settings.defaultMode,
            lineNumbers: settings.lineNumbers,
          })
          .catch(() => undefined);
      }
    },

    openSettings: (tab) =>
      set((state) => ({ settingsOpen: true, settingsTab: tab ?? state.settingsTab })),
    closeSettings: () => set({ settingsOpen: false }),
    setSettingsTab: (tab) => set({ settingsTab: tab }),

    setCursor: (cursor) => set({ cursor }),
  };
});

function emptyPane(): PaneState {
  paneCounter += 1;
  return { id: `pane-${paneCounter}`, tabs: [], active: null, views: {}, splitPct: 50 };
}

function clampRatio(ratio: number): number {
  return Math.min(0.75, Math.max(0.25, ratio));
}

function clampPct(pct: number): number {
  return Math.min(75, Math.max(25, pct));
}

function normalizeSettings(raw: Record<string, unknown>): Partial<LatticeSettings> {
  const result: Partial<LatticeSettings> = {};
  if (raw.defaultMode === 'rich' || raw.defaultMode === 'markdown') {
    result.defaultMode = raw.defaultMode;
  }
  if (typeof raw.lineNumbers === 'boolean') {
    result.lineNumbers = raw.lineNumbers;
  }
  return result;
}

function renamePath(path: string, from: string, to: string): string {
  if (path === from) return to;
  if (path.startsWith(`${from}/`)) return `${to}${path.slice(from.length)}`;
  return path;
}

export function noteTitle(relPath: string): string {
  const base = relPath.split('/').pop() ?? relPath;
  return base.replace(/\.md$/, '');
}

export function wordCount(content: string): number {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(words, content.trim().length > 0 ? 1 : 0);
}

export function editedLabel(modifiedMs: number | null): string {
  if (!modifiedMs) return '';
  const now = new Date();
  const then = new Date(modifiedMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (modifiedMs >= startOfToday) return 'edited today';
  if (modifiedMs >= startOfToday - 86_400_000) return 'edited yesterday';
  const days = Math.floor((startOfToday - then.getTime()) / 86_400_000) + 1;
  return `edited ${days} days ago`;
}

export function contentHash(content: string): string {
  return sha256Hex(content);
}
