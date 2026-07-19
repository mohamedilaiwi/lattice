import { useWorkspaceStore } from '../state/workspaceStore';

export function CompareDialog({ relPath }: { relPath: string }) {
  const note = useWorkspaceStore((state) => state.notes[relPath]);
  const resolveExternal = useWorkspaceStore((state) => state.resolveExternal);
  const closeCompare = useWorkspaceStore((state) => state.closeCompare);

  if (!note?.external) {
    return null;
  }

  const fileName = relPath.split('/').pop() ?? relPath;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Compare versions">
      <div className="compare-dialog">
        <header className="compare-header">Compare versions — {fileName}</header>
        <div className="compare-columns">
          <div className="compare-column">
            <div className="compare-column-header is-mine">YOUR UNSAVED VERSION</div>
            <pre className="compare-column-body">{note.content}</pre>
          </div>
          <div className="compare-column">
            <div className="compare-column-header">ON DISK</div>
            <pre className="compare-column-body">{note.external.content}</pre>
          </div>
        </div>
        <footer className="compare-footer">
          <button
            type="button"
            className="compare-button compare-button-muted"
            onClick={closeCompare}
          >
            Cancel
          </button>
          <button
            type="button"
            className="compare-button compare-button-outline"
            onClick={() => {
              resolveExternal(relPath, 'keep');
              closeCompare();
            }}
          >
            Keep my version
          </button>
          <button
            type="button"
            className="compare-button compare-button-primary"
            onClick={() => {
              resolveExternal(relPath, 'reload');
              closeCompare();
            }}
          >
            Reload from disk
          </button>
        </footer>
      </div>
    </div>
  );
}
