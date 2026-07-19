import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { sha256Hex } from './hash';
import { parseMarkdown } from './parse';
import { serializeBlocks } from './serialize';
import type { CalloutBlock, HeadingBlock, NumberedListItemBlock } from './types';

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));
const fixtures = readdirSync(fixturesDir)
  .filter((name) => name.endsWith('.md'))
  .map((name) => ({ name, source: readFileSync(join(fixturesDir, name), 'utf8') }));

describe('markdown round-trip', () => {
  it.each(fixtures.map(({ name, source }) => [name, source] as [string, string]))(
    'canonical serialization of %s is stable',
    (_name, source) => {
      const firstPass = parseMarkdown(source);
      const canonical = serializeBlocks(firstPass);
      const secondPass = parseMarkdown(canonical);

      expect(secondPass).toEqual(firstPass);
      expect(serializeBlocks(secondPass)).toBe(canonical);
    },
  );

  it('parses every fixture without throwing and never returns empty for content', () => {
    for (const { source } of fixtures) {
      expect(parseMarkdown(source).length).toBeGreaterThan(0);
    }
  });
});

describe('supported structures', () => {
  const basic = parseMarkdown(readFileSync(join(fixturesDir, 'basic.md'), 'utf8'));

  it('maps headings to levels 1-3', () => {
    const headings = basic.filter((block): block is HeadingBlock => block.type === 'heading');
    expect(headings.map((heading) => heading.level)).toEqual([1, 2, 3]);
    expect(headings[0].content).toEqual([
      { type: 'text', text: 'Semiconductor Lithography', styles: {} },
    ]);
  });

  it('captures inline styles and links', () => {
    const paragraph = basic[1];
    expect(paragraph.type).toBe('paragraph');
    if (paragraph.type !== 'paragraph') return;
    expect(paragraph.content).toContainEqual({
      type: 'text',
      text: 'photomask',
      styles: { bold: true },
    });
    expect(paragraph.content).toContainEqual({
      type: 'text',
      text: 'light-sensitive',
      styles: { italic: true },
    });
    expect(paragraph.content).toContainEqual({
      type: 'text',
      text: 'wavelength',
      styles: { code: true },
    });
  });

  it('preserves numbered-list start ordinals', () => {
    const lists = parseMarkdown(readFileSync(join(fixturesDir, 'lists.md'), 'utf8'));
    const numbered = lists.filter(
      (block): block is NumberedListItemBlock => block.type === 'numberedListItem',
    );
    expect(numbered).toHaveLength(3);
    expect(numbered[0].start).toBe(3);
    expect(numbered[1].children.map((child) => child.type)).toEqual([
      'numberedListItem',
      'numberedListItem',
    ]);
  });

  it('extracts callout kinds and bodies', () => {
    const blocks = parseMarkdown(readFileSync(join(fixturesDir, 'quotes-callouts.md'), 'utf8'));
    const callouts = blocks.filter((block): block is CalloutBlock => block.type === 'callout');
    expect(callouts.map((callout) => callout.kind)).toEqual(['note', 'warning']);
    expect(callouts[0].content[0]).toEqual({
      type: 'text',
      text: 'Callouts follow the Obsidian marker convention.',
      styles: {},
    });
    const quotes = blocks.filter((block) => block.type === 'quote');
    expect(quotes).toHaveLength(2);
  });
});

describe('unsupported syntax preservation', () => {
  const source = readFileSync(join(fixturesDir, 'unsupported.md'), 'utf8');
  const blocks = parseMarkdown(source);
  const serialized = serializeBlocks(blocks);

  it.each([
    ['code fence', 'def resolve(wavelength, na):'],
    ['table', '| KrF    | 248 nm     |'],
    ['level-four heading', '#### A level-four heading stays as written'],
    ['image', '![Stepper diagram](images/stepper.png)'],
    ['thematic break', '---'],
    ['task list', '- [ ] Task lists are not supported yet'],
    ['footnote definition', '[^1]: The footnote definition itself.'],
  ])('preserves the %s verbatim', (_label, snippet) => {
    expect(serialized).toContain(snippet);
  });

  it('represents unsupported constructs as passthrough blocks', () => {
    const passthroughs = blocks.filter((block) => block.type === 'passthrough');
    expect(passthroughs.length).toBeGreaterThanOrEqual(6);
  });
});

describe('sha256Hex', () => {
  it('matches the SHA-256 test vectors', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('a'.repeat(200))).toBe(sha256Hex('a'.repeat(100) + 'a'.repeat(100)));
  });
});
