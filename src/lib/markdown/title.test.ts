import { describe, expect, it } from 'vitest';

import { extractTitle, normalizeTitle, titleFromPath } from './title';

describe('extractTitle', () => {
  it('reads an ATX H1 title', () => {
    expect(extractTitle('# Optics\n\nBody.')).toBe('Optics');
    expect(extractTitle('\n\n# Optics')).toBe('Optics');
    expect(extractTitle('# ')).toBe('');
    expect(extractTitle('#')).toBe('');
  });

  it('reads a setext H1 title', () => {
    expect(extractTitle('Optics\n===\n\nBody.')).toBe('Optics');
  });

  it('returns null when the document does not start with an H1', () => {
    expect(extractTitle('')).toBeNull();
    expect(extractTitle('Just a paragraph.')).toBeNull();
    expect(extractTitle('## Not the title')).toBeNull();
    expect(extractTitle('Setext level two\n---')).toBeNull();
  });
});

describe('normalizeTitle', () => {
  it('keeps compliant content unchanged', () => {
    const content = '# Optics\n\nBody text.\n';
    expect(normalizeTitle(content, 'fallback')).toBe(content);
  });

  it('coerces other heading levels to H1', () => {
    expect(normalizeTitle('## Optics\n\nBody.', 'fallback')).toBe('# Optics\n\nBody.');
    expect(normalizeTitle('###### Deep\nBody.', 'fallback')).toBe('# Deep\nBody.');
  });

  it('coerces setext headings to an ATX H1', () => {
    expect(normalizeTitle('Optics\n===\n\nBody.', 'fallback')).toBe('# Optics\n\nBody.');
    expect(normalizeTitle('Optics\n---\n\nBody.', 'fallback')).toBe('# Optics\n\nBody.');
  });

  it('inserts the fallback title when the document starts with other content', () => {
    expect(normalizeTitle('Just a paragraph.', 'Optics')).toBe('# Optics\n\nJust a paragraph.');
  });

  it('produces a bare title for blank documents', () => {
    expect(normalizeTitle('', 'Optics')).toBe('# Optics\n');
    expect(normalizeTitle('\n\n', 'Optics')).toBe('# Optics\n');
  });

  it('is idempotent', () => {
    const inputs = ['', 'Just a paragraph.', '## Demoted', 'Setext\n===', '# Fine\n\nBody.'];
    for (const input of inputs) {
      const once = normalizeTitle(input, 'Title');
      expect(normalizeTitle(once, 'Title')).toBe(once);
    }
  });

  it('never renames the file: title text and file stem are independent', () => {
    // The invariant is structural only — a diverged title is preserved.
    const diverged = '# A completely different title\n\nBody.';
    expect(normalizeTitle(diverged, 'Filename Stem')).toBe(diverged);
  });
});

describe('titleFromPath', () => {
  it('uses the file stem', () => {
    expect(titleFromPath('Chemistry/Photoresist.md')).toBe('Photoresist');
    expect(titleFromPath('Top.md')).toBe('Top');
    expect(titleFromPath('Case.MD')).toBe('Case');
  });
});
