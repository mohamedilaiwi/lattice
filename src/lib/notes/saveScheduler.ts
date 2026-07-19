export type SaveResult =
  { status: 'saved'; hash: string } | { status: 'conflict'; diskHash: string; diskContent: string };

export interface SaveSchedulerOptions {
  delayMs: number;
  /** Perform the actual atomic write; `baseHash` guards against clobbering. */
  save: (path: string, content: string, baseHash: string | null) => Promise<SaveResult>;
  onSaved: (path: string, content: string, hash: string) => void;
  onConflict: (path: string, localContent: string, disk: { hash: string; content: string }) => void;
  onError?: (path: string, error: unknown) => void;
}

interface PendingSave {
  content: string;
  baseHash: string | null;
  timer: ReturnType<typeof setTimeout>;
  fireWhenDone: boolean;
}

/**
 * Debounced, per-note save queue. Rapid edits collapse into one atomic write;
 * a note never has two writes in flight; edits made while a save is running
 * are written afterwards against the hash that save produced.
 */
export class NoteSaveScheduler {
  private readonly pending = new Map<string, PendingSave>();
  private readonly inFlight = new Set<string>();
  private readonly knownHash = new Map<string, string>();

  constructor(private readonly options: SaveSchedulerOptions) {}

  schedule(path: string, content: string, baseHash: string | null): void {
    const existing = this.pending.get(path);
    if (existing) {
      clearTimeout(existing.timer);
    }
    const entry: PendingSave = {
      content,
      baseHash: existing?.baseHash ?? baseHash,
      timer: setTimeout(() => this.fire(path), this.options.delayMs),
      fireWhenDone: false,
    };
    this.pending.set(path, entry);
  }

  /** Save any pending content for the note immediately. */
  async flush(path: string): Promise<void> {
    const entry = this.pending.get(path);
    if (!entry) {
      return;
    }
    clearTimeout(entry.timer);
    await this.fire(path);
  }

  async flushAll(): Promise<void> {
    await Promise.all(Array.from(this.pending.keys()).map((path) => this.flush(path)));
  }

  hasPending(path: string): boolean {
    return this.pending.has(path) || this.inFlight.has(path);
  }

  /** Forget note state (closed tabs, reloaded notes). Does not cancel a running write. */
  discard(path: string): void {
    const entry = this.pending.get(path);
    if (entry) {
      clearTimeout(entry.timer);
      this.pending.delete(path);
    }
    this.knownHash.delete(path);
  }

  private async fire(path: string): Promise<void> {
    const entry = this.pending.get(path);
    if (!entry) {
      return;
    }
    if (this.inFlight.has(path)) {
      entry.fireWhenDone = true;
      return;
    }

    this.pending.delete(path);
    this.inFlight.add(path);
    const baseHash = this.knownHash.get(path) ?? entry.baseHash;
    try {
      const result = await this.options.save(path, entry.content, baseHash);
      if (result.status === 'saved') {
        this.knownHash.set(path, result.hash);
        this.options.onSaved(path, entry.content, result.hash);
      } else {
        this.options.onConflict(path, entry.content, {
          hash: result.diskHash,
          content: result.diskContent,
        });
      }
    } catch (error) {
      this.options.onError?.(path, error);
    } finally {
      this.inFlight.delete(path);
    }

    const queued = this.pending.get(path);
    if (queued?.fireWhenDone) {
      queued.fireWhenDone = false;
      await this.fire(path);
    }
  }
}
