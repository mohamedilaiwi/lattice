/**
 * Typed wrappers around the Tauri IPC surface. All backend access funnels
 * through here so the rest of the frontend never imports Tauri directly.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

export interface VaultInfo {
  path: string;
  name: string;
}

export interface TreeEntry {
  name: string;
  relPath: string;
  kind: 'dir' | 'note';
  children?: TreeEntry[];
}

export interface NoteFile {
  content: string;
  hash: string;
  /** Milliseconds since the Unix epoch of the file's last modification. */
  modifiedMs?: number | null;
}

export type WriteOutcome =
  { status: 'saved'; hash: string } | { status: 'conflict'; diskHash: string; diskContent: string };

export interface BlockCacheEntry {
  sourceHash: string;
  blocksJson: string;
}

export interface FsEventPayload {
  kind: 'created' | 'modified' | 'removed' | 'renamed';
  relPaths: string[];
}

export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export async function pickFolder(title: string): Promise<string | null> {
  const selection = await openDialog({ directory: true, multiple: false, title });
  return typeof selection === 'string' ? selection : null;
}

export const vaultApi = {
  getLastVault: () => invoke<string | null>('get_last_vault'),
  openVault: (path: string) => invoke<VaultInfo>('open_vault', { path }),
  createVault: (path: string) => invoke<VaultInfo>('create_vault', { path }),
  listTree: () => invoke<TreeEntry[]>('list_tree'),
  readNote: (relPath: string) => invoke<NoteFile>('read_note', { relPath }),
  writeNote: (relPath: string, content: string, baseHash: string | null) =>
    invoke<WriteOutcome>('write_note', { relPath, content, baseHash }),
  createNote: (relPath: string) => invoke<void>('create_note', { relPath }),
  createFolder: (relPath: string) => invoke<void>('create_folder', { relPath }),
  renameEntry: (fromRelPath: string, toRelPath: string) =>
    invoke<void>('rename_entry', { fromRelPath, toRelPath }),
  readBlockCache: (relPath: string) =>
    invoke<BlockCacheEntry | null>('read_block_cache', { relPath }),
  writeBlockCache: (relPath: string, sourceHash: string, blocksJson: string) =>
    invoke<void>('write_block_cache', { relPath, sourceHash, blocksJson }),
  readSettings: () => invoke<Record<string, unknown>>('read_settings'),
  writeSettings: (settings: Record<string, unknown>) =>
    invoke<void>('write_settings', { settings }),
  loadWorkspaceState: () => invoke<string | null>('load_workspace_state'),
  saveWorkspaceState: (json: string) => invoke<void>('save_workspace_state', { json }),
};

export function onVaultFsEvent(handler: (payload: FsEventPayload) => void): Promise<UnlistenFn> {
  return listen<FsEventPayload>('vault://fs-event', (event) => handler(event.payload));
}
