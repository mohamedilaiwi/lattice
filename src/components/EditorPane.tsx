import { useCallback, useRef, useState } from 'react';

import { currentNoteDrag, endNoteDrag, startNoteDrag } from '../lib/dnd';
import {
  editedLabel,
  noteTitle,
  useWorkspaceStore,
  wordCount,
  type PaneState,
} from '../state/workspaceStore';
import { FileIcon, MarkdownViewIcon, RichViewIcon, SplitViewIcon, WarnIcon } from './icons';
import { MarkdownEditor } from './MarkdownEditor';
import { RichEditor } from './RichEditor';

type DropZone = 'center' | 'right' | null;

export function EditorPane({ pane }: { pane: PaneState }) {
  const setFocusedPane = useWorkspaceStore((state) => state.setFocusedPane);
  const closeTab = useWorkspaceStore((state) => state.closeTab);
  const activateTab = useWorkspaceStore((state) => state.activateTab);
  const setNoteView = useWorkspaceStore((state) => state.setNoteView);
  const setSplitPct = useWorkspaceStore((state) => state.setSplitPct);
  const moveTab = useWorkspaceStore((state) => state.moveTab);
  const openSideBySide = useWorkspaceStore((state) => state.openSideBySide);
  const resolveExternal = useWorkspaceStore((state) => state.resolveExternal);
  const startCreate = useWorkspaceStore((state) => state.startCreate);
  const paneCount = useWorkspaceStore((state) => state.panes.length);
  const note = useWorkspaceStore((state) => (pane.active ? state.notes[pane.active] : undefined));

  const [dropZone, setDropZone] = useState<DropZone>(null);
  const sectionRef = useRef<HTMLElement>(null);

  const active = pane.active;
  const view = active ? (pane.views[active] ?? 'rich') : 'rich';
  const isSplit = view === 'split';

  const onZoneOver = useCallback(
    (event: React.DragEvent) => {
      if (!currentNoteDrag()) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const zone: DropZone =
        paneCount < 2 && event.clientX > rect.left + rect.width * 0.55 ? 'right' : 'center';
      setDropZone((current) => (current === zone ? current : zone));
    },
    [paneCount],
  );

  const onZoneDrop = useCallback(
    (event: React.DragEvent) => {
      const drag = currentNoteDrag();
      endNoteDrag();
      setDropZone(null);
      if (!drag) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const zone: DropZone =
        paneCount < 2 && event.clientX > rect.left + rect.width * 0.55 ? 'right' : 'center';
      if (zone === 'right') {
        openSideBySide(drag.relPath, drag.fromPane);
      } else {
        moveTab(drag.relPath, drag.fromPane, pane.id);
      }
    },
    [moveTab, openSideBySide, pane.id, paneCount],
  );

  const startSplitDrag = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      const host = sectionRef.current;
      if (!host) return;
      const width = host.getBoundingClientRect().width || 900;
      const startX = event.clientX;
      const startPct = pane.splitPct;

      function onMove(move: PointerEvent) {
        setSplitPct(pane.id, startPct + ((move.clientX - startX) / width) * 100);
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [pane.id, pane.splitPct, setSplitPct],
  );

  return (
    <section
      ref={sectionRef}
      className="editor-pane"
      onPointerDownCapture={() => setFocusedPane(pane.id)}
      onDragOver={onZoneOver}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setDropZone(null);
        }
      }}
      onDrop={onZoneDrop}
    >
      {dropZone === 'right' && <div className="drop-hint drop-hint-right" />}
      {dropZone === 'center' && <div className="drop-hint drop-hint-center" />}

      <div
        className="tab-strip"
        role="tablist"
        onWheel={(event) => {
          const strip = event.currentTarget;
          if (strip.scrollWidth > strip.clientWidth) {
            strip.scrollLeft += event.deltaY || event.deltaX;
          }
        }}
      >
        {pane.tabs.map((tab) => (
          <div
            key={tab}
            role="tab"
            aria-selected={tab === active}
            className={`tab${tab === active ? ' is-active' : ''}`}
            draggable
            onDragStart={(event) => {
              startNoteDrag({ relPath: tab, fromPane: pane.id });
              event.dataTransfer.setData('application/lattice-note', tab);
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(event) => {
              if (currentNoteDrag()) event.preventDefault();
            }}
            onDrop={(event) => {
              const drag = currentNoteDrag();
              endNoteDrag();
              setDropZone(null);
              if (!drag || drag.relPath === tab) return;
              event.preventDefault();
              event.stopPropagation();
              moveTab(drag.relPath, drag.fromPane, pane.id, tab);
            }}
            onClick={() => activateTab(pane.id, tab)}
          >
            <span className="tab-icon">
              <FileIcon />
            </span>
            <span className="tab-title">{noteTitle(tab)}</span>
            <button
              type="button"
              className="tab-close"
              aria-label={`Close ${noteTitle(tab)}`}
              onClick={(event) => {
                event.stopPropagation();
                closeTab(pane.id, tab);
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {active && note ? (
        <>
          <div className="note-toolbar">
            <span className="note-toolbar-title">{noteTitle(active)}</span>
            <span className="note-toolbar-meta">
              {wordCount(note.content)} words
              {editedLabel(note.modifiedMs) ? ` · ${editedLabel(note.modifiedMs)}` : ''}
            </span>
            <SaveState
              dirty={note.dirty}
              saving={note.saving}
              editedElsewhere={
                note.dirty && note.lastEditPane !== null && note.lastEditPane !== pane.id
              }
            />
            <span className="note-toolbar-spacer" />
            <div className="view-switcher" role="group" aria-label="Editor view">
              <button
                type="button"
                title="Markdown view (Ctrl+E toggles)"
                aria-label="Markdown view"
                className={view === 'markdown' ? 'is-active' : ''}
                onClick={() => setNoteView(pane.id, active, 'markdown')}
              >
                <MarkdownViewIcon />
              </button>
              <button
                type="button"
                title="Rich view (Ctrl+E toggles)"
                aria-label="Rich view"
                className={view === 'rich' ? 'is-active' : ''}
                onClick={() => setNoteView(pane.id, active, 'rich')}
              >
                <RichViewIcon />
              </button>
              <button
                type="button"
                title="Split view (Ctrl+\)"
                aria-label="Split view"
                className={isSplit ? 'is-active' : ''}
                onClick={() => setNoteView(pane.id, active, isSplit ? 'rich' : 'split')}
              >
                <SplitViewIcon />
              </button>
            </div>
          </div>

          {note.external && (
            <div className="external-banner" role="alert">
              <span className="external-banner-icon">
                <WarnIcon />
              </span>
              <span className="external-banner-text">
                This note changed outside Lattice while you have unsaved edits.
              </span>
              <button
                type="button"
                className="banner-button banner-button-solid"
                onClick={() => resolveExternal(active, 'reload')}
              >
                Reload from disk
              </button>
              <button
                type="button"
                className="banner-button"
                onClick={() => resolveExternal(active, 'keep')}
              >
                Keep my version
              </button>
              <button
                type="button"
                className="banner-button"
                onClick={() => resolveExternal(active, 'compare')}
              >
                Compare
              </button>
            </div>
          )}

          <div className="editor-row">
            {(view === 'rich' || isSplit) && (
              <div
                className="editor-col editor-col-rich"
                style={{ flexGrow: isSplit ? pane.splitPct : 100 }}
              >
                <RichEditor paneId={pane.id} relPath={active} />
              </div>
            )}
            {(view === 'markdown' || isSplit) && (
              <div
                className={`editor-col editor-col-md${isSplit ? ' editor-col-md-split' : ''}`}
                style={{ flexGrow: isSplit ? 100 - pane.splitPct : 100 }}
              >
                {isSplit && (
                  <div
                    className="split-divider"
                    role="separator"
                    aria-orientation="vertical"
                    title="Drag to resize"
                    onPointerDown={startSplitDrag}
                  />
                )}
                <MarkdownEditor paneId={pane.id} relPath={active} />
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="pane-empty">
          <span>Select a note from the vault, or drag one here.</span>
          <button type="button" className="pane-empty-button" onClick={() => startCreate('note')}>
            ＋ New note
          </button>
        </div>
      )}
    </section>
  );
}

function SaveState({
  dirty,
  saving,
  editedElsewhere,
}: {
  dirty: boolean;
  saving: boolean;
  editedElsewhere: boolean;
}) {
  if (editedElsewhere) {
    return <span className="save-state is-syncing">Syncing…</span>;
  }
  if (saving || dirty) {
    return <span className="save-state is-saving">Saving…</span>;
  }
  return <span className="save-state is-saved">Saved locally</span>;
}
