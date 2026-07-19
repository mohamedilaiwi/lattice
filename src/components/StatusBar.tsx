import { noteTitle, useWorkspaceStore, wordCount } from '../state/workspaceStore';

export function StatusBar() {
  const vault = useWorkspaceStore((state) => state.vault);
  const activePath = useWorkspaceStore(
    (state) => state.panes.find((pane) => pane.id === state.focusedPane)?.active ?? null,
  );
  const note = useWorkspaceStore((state) => (activePath ? state.notes[activePath] : undefined));
  const cursor = useWorkspaceStore((state) => state.cursor);

  let saveText = '';
  if (activePath && note) {
    if (note.external) {
      saveText = 'External change pending review';
    } else if (note.saving || note.dirty) {
      saveText = 'Saving…';
    } else {
      saveText = 'Saved locally';
    }
  }

  const line = cursor?.line ?? 1;
  const col = cursor?.col ?? 1;

  return (
    <footer className="status-bar">
      <span className="status-vault" title={vault?.path}>
        {vault ? vault.path : 'No vault open'}
      </span>
      <span className="status-spacer" />
      {activePath && note ? (
        <>
          <span>
            {noteTitle(activePath)} · {saveText}
          </span>
          <span>
            Ln {line}, Col {col} · {wordCount(note.content)} words · Markdown · UTF-8
          </span>
        </>
      ) : (
        <span>No note open</span>
      )}
      <span className="local-pill" title="No user content leaves this machine">
        Local-only
      </span>
    </footer>
  );
}
