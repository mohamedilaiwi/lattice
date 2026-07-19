import type { ActivityView } from '../state/workspaceStore';
import { useWorkspaceStore } from '../state/workspaceStore';
import { GraphIcon, SearchIcon, SettingsIcon, VaultIcon } from './icons';

const ITEMS: Array<{ view: ActivityView; label: string; icon: React.ReactNode }> = [
  { view: 'vault', label: 'Vault', icon: <VaultIcon /> },
  { view: 'search', label: 'Search', icon: <SearchIcon /> },
  { view: 'graph', label: 'Graph', icon: <GraphIcon /> },
];

export function ActivityRail() {
  const view = useWorkspaceStore((state) => state.view);
  const settingsOpen = useWorkspaceStore((state) => state.settingsOpen);
  const setView = useWorkspaceStore((state) => state.setView);
  const openSettings = useWorkspaceStore((state) => state.openSettings);

  return (
    <nav className="activity-rail" aria-label="Primary">
      {ITEMS.map((item) => (
        <button
          key={item.view}
          type="button"
          className={`rail-item${view === item.view && !settingsOpen ? ' is-active' : ''}`}
          title={item.label}
          aria-label={item.label}
          onClick={() => setView(item.view)}
        >
          {item.icon}
        </button>
      ))}
      <button
        type="button"
        className={`rail-item rail-item-settings${settingsOpen ? ' is-active' : ''}`}
        title="Settings"
        aria-label="Settings"
        onClick={() => openSettings()}
      >
        <SettingsIcon />
      </button>
    </nav>
  );
}
