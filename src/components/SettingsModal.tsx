import { pickFolder } from '../lib/tauri';
import type { SettingsTab } from '../state/workspaceStore';
import { useWorkspaceStore } from '../state/workspaceStore';
import { ChevronDownIcon, KeyIcon, RichViewIcon, VaultIcon } from './icons';

const NAV: Array<{ id: SettingsTab; label: string; icon: React.ReactNode }> = [
  { id: 'general', label: 'General', icon: <VaultIcon size={15} /> },
  { id: 'editor', label: 'Editor', icon: <RichViewIcon /> },
  { id: 'providers', label: 'Providers', icon: <KeyIcon /> },
];

const TITLES: Record<SettingsTab, string> = {
  general: 'General',
  editor: 'Editor',
  providers: 'Providers',
};

export function SettingsModal() {
  const vault = useWorkspaceStore((state) => state.vault);
  const tab = useWorkspaceStore((state) => state.settingsTab);
  const setTab = useWorkspaceStore((state) => state.setSettingsTab);
  const close = useWorkspaceStore((state) => state.closeSettings);
  const settings = useWorkspaceStore((state) => state.settings);
  const updateSettings = useWorkspaceStore((state) => state.updateSettings);
  const openVaultAt = useWorkspaceStore((state) => state.openVaultAt);

  async function changeVault() {
    const path = await pickFolder('Open a different vault folder');
    if (path) {
      close();
      await openVaultAt(path);
    }
  }

  return (
    <div className="settings-backdrop" role="dialog" aria-modal="true" onClick={close}>
      <div className="settings-panel" onClick={(event) => event.stopPropagation()}>
        <div className="settings-nav">
          <div className="settings-nav-label">WORKSPACE</div>
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`settings-nav-item${tab === item.id ? ' is-active' : ''}`}
              onClick={() => setTab(item.id)}
            >
              <span className="settings-nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
          <div className="settings-nav-footer">
            Stored in <code>.lattice/settings.json</code>
          </div>
        </div>
        <div className="settings-content">
          <header className="settings-content-header">
            <span>{TITLES[tab]}</span>
            <button type="button" aria-label="Close (Esc)" title="Close (Esc)" onClick={close}>
              ×
            </button>
          </header>
          <div className="settings-body">
            {tab === 'general' && (
              <>
                <div className="settings-row">
                  <div className="settings-row-text">
                    <div className="settings-row-label">Vault folder</div>
                    <div className="settings-row-desc">
                      Notes are plain .md files — no database.
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <span className="settings-chip">{vault?.path}</span>
                    <button
                      type="button"
                      className="settings-button"
                      onClick={() => void changeVault()}
                    >
                      Change…
                    </button>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row-text">
                    <div className="settings-row-label">App data</div>
                    <div className="settings-row-desc">
                      Workspace state lives inside the vault. Nothing leaves your machine.
                    </div>
                  </div>
                  <div className="settings-row-control">
                    <span className="settings-chip">.lattice/</span>
                    <span className="local-pill">Local-only</span>
                  </div>
                </div>
              </>
            )}
            {tab === 'editor' && (
              <>
                <div className="settings-row">
                  <div className="settings-row-text">
                    <div className="settings-row-label">Default mode for opening notes</div>
                    <div className="settings-row-desc">
                      Applies when a note is opened from the vault.
                    </div>
                  </div>
                  <div className="settings-row-control settings-select-wrap">
                    <select
                      value={settings.defaultMode}
                      onChange={(event) =>
                        updateSettings({
                          defaultMode: event.target.value as 'rich' | 'markdown',
                        })
                      }
                    >
                      <option value="rich">Rich</option>
                      <option value="markdown">Markdown</option>
                    </select>
                    <span className="settings-select-chevron">
                      <ChevronDownIcon />
                    </span>
                  </div>
                </div>
                <div className="settings-row">
                  <div className="settings-row-text">
                    <div className="settings-row-label">Line numbers</div>
                    <div className="settings-row-desc">Show line numbers in the Markdown view.</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.lineNumbers}
                    aria-label="Line numbers"
                    className={`settings-switch${settings.lineNumbers ? ' is-on' : ''}`}
                    onClick={() => updateSettings({ lineNumbers: !settings.lineNumbers })}
                  >
                    <span className="settings-switch-knob" />
                  </button>
                </div>
              </>
            )}
            {tab === 'providers' && (
              <>
                <div className="settings-providers-heading">
                  <span className="settings-row-label">Model providers</span>
                  <span className="milestone-pill">Later milestone</span>
                </div>
                <div className="settings-providers-empty">
                  <p>
                    Lattice will connect to model providers in a later milestone. API keys are
                    stored in your OS keychain — never inside the vault.
                  </p>
                  <button type="button" className="settings-button" disabled>
                    Add provider
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
