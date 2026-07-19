import { pickFolder } from '../lib/tauri';
import { useWorkspaceStore } from '../state/workspaceStore';

export function Onboarding() {
  const openVaultAt = useWorkspaceStore((state) => state.openVaultAt);
  const createVaultAt = useWorkspaceStore((state) => state.createVaultAt);
  const vaultError = useWorkspaceStore((state) => state.vaultError);

  async function handleOpen() {
    const path = await pickFolder('Open an existing vault folder');
    if (path) await openVaultAt(path);
  }

  async function handleCreate() {
    const path = await pickFolder('Choose an empty folder for the new vault');
    if (path) await createVaultAt(path);
  }

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <h1>Lattice</h1>
        <p className="onboarding-lede">
          A local-first learning workspace. Your notes are plain Markdown files, in a folder you
          choose.
        </p>
        <div className="onboarding-actions">
          <button type="button" className="button-primary" onClick={() => void handleOpen()}>
            Open vault
          </button>
          <button type="button" className="button-secondary" onClick={() => void handleCreate()}>
            Create vault
          </button>
        </div>
        {vaultError && <p className="onboarding-error">{vaultError}</p>}
        <p className="onboarding-footnote">
          App state lives in <code>.lattice/</code> inside the vault. Nothing leaves your machine.
        </p>
      </div>
    </div>
  );
}
