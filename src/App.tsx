import { useEffect } from 'react';

import { ActivityRail } from './components/ActivityRail';
import { CompareDialog } from './components/CompareDialog';
import { Onboarding } from './components/Onboarding';
import { SettingsModal } from './components/SettingsModal';
import { StatusBar } from './components/StatusBar';
import { VaultSidebar } from './components/VaultSidebar';
import { Workspace } from './components/Workspace';
import { useWorkspaceStore } from './state/workspaceStore';

export function App() {
  const tauriAvailable = useWorkspaceStore((state) => state.tauriAvailable);
  const vault = useWorkspaceStore((state) => state.vault);
  const compare = useWorkspaceStore((state) => state.compare);
  const settingsOpen = useWorkspaceStore((state) => state.settingsOpen);
  const boot = useWorkspaceStore((state) => state.boot);

  useEffect(() => {
    void boot();
  }, [boot]);

  // Global shortcuts: ⌘/Ctrl+E toggles Rich↔Markdown, ⌘/Ctrl+\ toggles Split.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const state = useWorkspaceStore.getState();
      if (event.key === 'Escape' && state.settingsOpen) {
        state.closeSettings();
        return;
      }
      if (!(event.metaKey || event.ctrlKey)) return;
      const pane = state.panes.find((candidate) => candidate.id === state.focusedPane);
      const active = pane?.active;
      if (!pane || !active) return;
      const view = pane.views[active] ?? 'rich';
      if (event.key === 'e') {
        event.preventDefault();
        state.setNoteView(pane.id, active, view === 'markdown' ? 'rich' : 'markdown');
      }
      if (event.key === '\\') {
        event.preventDefault();
        state.setNoteView(pane.id, active, view === 'split' ? 'rich' : 'split');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!tauriAvailable) {
    return (
      <div className="app-notice">
        <h1>Lattice</h1>
        <p>
          This is the Lattice frontend running outside the desktop shell. Start it with
          <code> npm run tauri:dev</code> to open a vault.
        </p>
      </div>
    );
  }

  if (!vault) {
    return <Onboarding />;
  }

  return (
    <div className="app-shell">
      <div className="app-main">
        <ActivityRail />
        <VaultSidebar />
        <Workspace />
      </div>
      <StatusBar />
      {settingsOpen && <SettingsModal />}
      {compare && <CompareDialog relPath={compare.relPath} />}
    </div>
  );
}
