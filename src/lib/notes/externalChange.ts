/**
 * Decide how to react when the file watcher reports an on-disk change.
 *
 * - `ignore`: the change is the echo of our own most recent save.
 * - `reload`: the note has no unsaved edits, so the editor follows the disk.
 * - `review`: unsaved local edits exist; the user chooses (never overwrite).
 */
export type ExternalChangeDecision = 'ignore' | 'reload' | 'review';

export interface ExternalChangeInput {
  /** Does the open note have unsaved editor changes? */
  isDirty: boolean;
  /** Hash of the file content now on disk. */
  externalHash: string;
  /** Hash of the content this app last wrote (or loaded), if any. */
  lastKnownHash: string | null;
}

export function decideExternalChange(input: ExternalChangeInput): ExternalChangeDecision {
  if (input.externalHash === input.lastKnownHash) {
    return 'ignore';
  }
  return input.isDirty ? 'review' : 'reload';
}
