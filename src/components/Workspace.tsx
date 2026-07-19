import { useCallback, useEffect, useRef } from 'react';

import { endNoteDrag } from '../lib/dnd';
import { useWorkspaceStore } from '../state/workspaceStore';
import { EditorPane } from './EditorPane';

export function Workspace() {
  const panes = useWorkspaceStore((state) => state.panes);
  const splitRatio = useWorkspaceStore((state) => state.splitRatio);
  const setSplitRatio = useWorkspaceStore((state) => state.setSplitRatio);
  const containerRef = useRef<HTMLDivElement>(null);

  // A drag that ends anywhere (including outside the window) clears the payload.
  useEffect(() => {
    window.addEventListener('dragend', endNoteDrag);
    return () => window.removeEventListener('dragend', endNoteDrag);
  }, []);

  const startDividerDrag = useCallback(
    (event: React.PointerEvent) => {
      event.preventDefault();
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();

      function onMove(move: PointerEvent) {
        setSplitRatio((move.clientX - rect.left) / rect.width);
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [setSplitRatio],
  );

  return (
    <div className="workspace" ref={containerRef}>
      {panes.map((pane, index) => (
        <div
          key={pane.id}
          className={`workspace-group${index > 0 ? ' workspace-group-second' : ''}`}
          style={{
            flexGrow: panes.length === 1 ? 1 : index === 0 ? splitRatio : 1 - splitRatio,
          }}
        >
          {index > 0 && (
            <div
              className="group-divider"
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize"
              onPointerDown={startDividerDrag}
            />
          )}
          <EditorPane pane={pane} />
        </div>
      ))}
      <div className="agent-reserve" title="Agent drawer — later milestone">
        <span>‹</span>
      </div>
    </div>
  );
}
