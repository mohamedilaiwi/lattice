import { useState } from 'react';

import { startNoteDrag } from '../lib/dnd';
import type { TreeEntry } from '../lib/tauri';
import { useWorkspaceStore } from '../state/workspaceStore';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  NewFolderIcon,
  NewNoteIcon,
} from './icons';

export function VaultSidebar() {
  const vault = useWorkspaceStore((state) => state.vault);
  const view = useWorkspaceStore((state) => state.view);
  const tree = useWorkspaceStore((state) => state.tree);
  const creating = useWorkspaceStore((state) => state.creating);
  const startCreate = useWorkspaceStore((state) => state.startCreate);
  const cancelCreate = useWorkspaceStore((state) => state.cancelCreate);
  const createNote = useWorkspaceStore((state) => state.createNote);
  const createFolder = useWorkspaceStore((state) => state.createFolder);
  const openNote = useWorkspaceStore((state) => state.openNote);
  const focusedPane = useWorkspaceStore((state) => state.focusedPane);
  const vaultError = useWorkspaceStore((state) => state.vaultError);

  const [draftName, setDraftName] = useState('');

  async function submitCreate() {
    const name = draftName.trim();
    const kind = creating;
    cancelCreate();
    setDraftName('');
    if (!name || !kind) return;
    if (kind === 'note') {
      const relPath = await createNote('', name);
      if (relPath) await openNote(focusedPane, relPath);
    } else {
      await createFolder('', name);
    }
  }

  if (view !== 'vault') {
    return (
      <aside className="vault-sidebar">
        <div className="sidebar-placeholder">
          <div className="sidebar-placeholder-title">{view === 'search' ? 'Search' : 'Graph'}</div>
          <div className="sidebar-placeholder-body">Arrives in a later milestone.</div>
        </div>
      </aside>
    );
  }

  return (
    <aside className="vault-sidebar">
      <header className="sidebar-header">
        <span className="sidebar-vault-name" title={vault?.path}>
          {vault?.name ?? 'Vault'}
        </span>
        <button
          type="button"
          className="sidebar-icon-button"
          title="New note"
          aria-label="New note"
          onClick={() => startCreate('note')}
        >
          <NewNoteIcon />
        </button>
        <button
          type="button"
          className="sidebar-icon-button"
          title="New folder"
          aria-label="New folder"
          onClick={() => startCreate('folder')}
        >
          <NewFolderIcon />
        </button>
      </header>
      <div className="sidebar-tree" role="tree">
        <div className="sidebar-section-label">VAULT</div>
        {creating && (
          <form
            className="sidebar-create"
            onSubmit={(event) => {
              event.preventDefault();
              void submitCreate();
            }}
          >
            <span className="sidebar-create-icon">
              {creating === 'folder' ? <FolderIcon /> : <FileIcon />}
            </span>
            <input
              autoFocus
              value={draftName}
              placeholder={creating === 'folder' ? 'Folder name…' : 'Note title…'}
              onChange={(event) => setDraftName(event.target.value)}
              onBlur={() => void submitCreate()}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  cancelCreate();
                  setDraftName('');
                }
              }}
            />
          </form>
        )}
        {tree.length === 0 && !creating ? (
          <p className="sidebar-empty">No notes yet. Create your first note.</p>
        ) : (
          tree.map((entry) => <TreeNode key={entry.relPath} entry={entry} depth={0} />)
        )}
      </div>
      {vaultError && <p className="sidebar-error">{vaultError}</p>}
    </aside>
  );
}

function TreeNode({ entry, depth }: { entry: TreeEntry; depth: number }) {
  const openNote = useWorkspaceStore((state) => state.openNote);
  const focusedPane = useWorkspaceStore((state) => state.focusedPane);
  const renameEntry = useWorkspaceStore((state) => state.renameEntry);
  // Per the design, only notes visible in a group (its active tab) are tinted.
  const isViewing = useWorkspaceStore((state) =>
    state.panes.some((pane) => pane.active === entry.relPath),
  );

  const [expanded, setExpanded] = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(entry.name);

  const notePad = 8 + depth * 22;
  const folderPad = 6 + depth * 22;

  async function submitRename() {
    setRenaming(false);
    const name = draft.trim();
    if (!name || name === entry.name) return;
    const parent = entry.relPath.split('/').slice(0, -1).join('/');
    const target = entry.kind === 'note' && !name.endsWith('.md') ? `${name}.md` : name;
    await renameEntry(entry.relPath, parent ? `${parent}/${target}` : target);
  }

  if (renaming) {
    return (
      <form
        className="sidebar-create tree-rename"
        style={{ marginLeft: `${folderPad}px` }}
        onSubmit={(event) => {
          event.preventDefault();
          void submitRename();
        }}
      >
        <input
          autoFocus
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void submitRename()}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setRenaming(false);
          }}
        />
      </form>
    );
  }

  if (entry.kind === 'dir') {
    const noteCount = (entry.children ?? []).filter((child) => child.kind === 'note').length;
    return (
      <div role="treeitem" aria-expanded={expanded}>
        <button
          type="button"
          className="tree-row tree-dir"
          style={{ paddingLeft: `${folderPad}px` }}
          onClick={() => setExpanded(!expanded)}
          onDoubleClick={() => {
            setDraft(entry.name);
            setRenaming(true);
          }}
        >
          <span className="tree-row-icon">
            {expanded ? <ChevronDownIcon /> : <ChevronRightIcon />}
            <FolderIcon />
          </span>
          <span className="tree-row-label">{entry.name}</span>
          {noteCount > 0 && <span className="tree-row-count">{noteCount}</span>}
        </button>
        {expanded &&
          entry.children?.map((child) => (
            <TreeNode key={child.relPath} entry={child} depth={depth + 1} />
          ))}
      </div>
    );
  }

  return (
    <button
      type="button"
      role="treeitem"
      draggable
      className={`tree-row tree-note${isViewing ? ' is-viewing' : ''}`}
      style={{ paddingLeft: `${notePad}px` }}
      onClick={() => void openNote(focusedPane, entry.relPath)}
      onDoubleClick={() => {
        setDraft(entry.name.replace(/\.md$/, ''));
        setRenaming(true);
      }}
      onDragStart={(event) => {
        startNoteDrag({ relPath: entry.relPath, fromPane: null });
        event.dataTransfer.setData('application/lattice-note', entry.relPath);
        event.dataTransfer.effectAllowed = 'copyMove';
      }}
    >
      <span className="tree-row-icon">
        <FileIcon />
      </span>
      <span className="tree-row-label">{entry.name.replace(/\.md$/, '')}</span>
    </button>
  );
}
