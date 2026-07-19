/**
 * Shared drag payload for tab / tree-note dragging. HTML5 dataTransfer cannot
 * be read during dragover, so the payload lives here for the drag's duration.
 */
export interface NoteDrag {
  relPath: string;
  /** Pane the tab came from; null when dragged from the vault tree. */
  fromPane: string | null;
}

let current: NoteDrag | null = null;

export function startNoteDrag(drag: NoteDrag): void {
  current = drag;
}

export function currentNoteDrag(): NoteDrag | null {
  return current;
}

export function endNoteDrag(): void {
  current = null;
}
