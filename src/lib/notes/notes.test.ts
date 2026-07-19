import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { decideExternalChange } from './externalChange';
import { NoteSaveScheduler, type SaveResult } from './saveScheduler';

describe('decideExternalChange', () => {
  it('ignores the echo of our own save', () => {
    expect(
      decideExternalChange({ isDirty: false, externalHash: 'aaa', lastKnownHash: 'aaa' }),
    ).toBe('ignore');
    expect(decideExternalChange({ isDirty: true, externalHash: 'aaa', lastKnownHash: 'aaa' })).toBe(
      'ignore',
    );
  });

  it('reloads clean notes when the disk changes', () => {
    expect(
      decideExternalChange({ isDirty: false, externalHash: 'bbb', lastKnownHash: 'aaa' }),
    ).toBe('reload');
  });

  it('asks for review instead of overwriting unsaved edits', () => {
    expect(decideExternalChange({ isDirty: true, externalHash: 'bbb', lastKnownHash: 'aaa' })).toBe(
      'review',
    );
    expect(decideExternalChange({ isDirty: true, externalHash: 'bbb', lastKnownHash: null })).toBe(
      'review',
    );
  });
});

describe('NoteSaveScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function makeScheduler(saveImpl?: (content: string, baseHash: string | null) => SaveResult) {
    const saves: Array<{ content: string; baseHash: string | null }> = [];
    const saved: Array<{ content: string; hash: string }> = [];
    const conflicts: Array<{ content: string; diskHash: string }> = [];
    const scheduler = new NoteSaveScheduler({
      delayMs: 100,
      save: async (_path, content, baseHash) => {
        saves.push({ content, baseHash });
        return saveImpl
          ? saveImpl(content, baseHash)
          : { status: 'saved', hash: `hash(${content})` };
      },
      onSaved: (_path, content, hash) => saved.push({ content, hash }),
      onConflict: (_path, content, disk) => conflicts.push({ content, diskHash: disk.hash }),
    });
    return { scheduler, saves, saved, conflicts };
  }

  it('collapses rapid edits into a single save of the latest content', async () => {
    const { scheduler, saves, saved } = makeScheduler();
    scheduler.schedule('a.md', 'one', 'h0');
    vi.advanceTimersByTime(50);
    scheduler.schedule('a.md', 'two', 'h0');
    vi.advanceTimersByTime(50);
    scheduler.schedule('a.md', 'three', 'h0');
    await vi.advanceTimersByTimeAsync(100);

    expect(saves).toEqual([{ content: 'three', baseHash: 'h0' }]);
    expect(saved).toEqual([{ content: 'three', hash: 'hash(three)' }]);
    expect(scheduler.hasPending('a.md')).toBe(false);
  });

  it('queues edits made during an in-flight save and uses the new base hash', async () => {
    let release: (value: SaveResult) => void = () => {};
    const gate = new Promise<SaveResult>((resolve) => {
      release = resolve;
    });
    const saves: Array<{ content: string; baseHash: string | null }> = [];
    const saved: string[] = [];
    let firstCall = true;
    const scheduler = new NoteSaveScheduler({
      delayMs: 100,
      save: async (_path, content, baseHash) => {
        saves.push({ content, baseHash });
        if (firstCall) {
          firstCall = false;
          return gate;
        }
        return { status: 'saved', hash: `hash(${content})` };
      },
      onSaved: (_path, content) => saved.push(content),
      onConflict: () => {
        throw new Error('unexpected conflict');
      },
    });

    scheduler.schedule('a.md', 'first', 'h0');
    await vi.advanceTimersByTimeAsync(100);
    // First save is now in flight; edit again and let its debounce elapse.
    scheduler.schedule('a.md', 'second', 'h0');
    await vi.advanceTimersByTimeAsync(100);
    expect(saves).toHaveLength(1);

    release({ status: 'saved', hash: 'h1' });
    await vi.runAllTimersAsync();

    expect(saves).toEqual([
      { content: 'first', baseHash: 'h0' },
      { content: 'second', baseHash: 'h1' },
    ]);
    expect(saved).toEqual(['first', 'second']);
  });

  it('reports conflicts without claiming the save succeeded', async () => {
    const { scheduler, saved, conflicts } = makeScheduler(() => ({
      status: 'conflict',
      diskHash: 'disk-hash',
      diskContent: 'external content',
    }));
    scheduler.schedule('a.md', 'mine', 'h0');
    await vi.advanceTimersByTimeAsync(100);

    expect(saved).toEqual([]);
    expect(conflicts).toEqual([{ content: 'mine', diskHash: 'disk-hash' }]);
  });

  it('flush saves immediately without waiting for the debounce', async () => {
    const { scheduler, saves } = makeScheduler();
    scheduler.schedule('a.md', 'now', 'h0');
    await scheduler.flush('a.md');
    expect(saves).toEqual([{ content: 'now', baseHash: 'h0' }]);
  });

  it('discard drops pending work', async () => {
    const { scheduler, saves } = makeScheduler();
    scheduler.schedule('a.md', 'dropped', 'h0');
    scheduler.discard('a.md');
    await vi.advanceTimersByTimeAsync(1000);
    expect(saves).toEqual([]);
    expect(scheduler.hasPending('a.md')).toBe(false);
  });
});
