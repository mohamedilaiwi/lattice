/**
 * Note-title invariant (Obsidian/Notion convention): the first line of a note
 * is always an H1 title. It is seeded from the file name at creation, its
 * format can never change (no other heading level, no styling), and editing
 * it never renames the file.
 *
 * Enforcement happens on edit, not on load — merely opening a file must never
 * rewrite it.
 */

const ATX_H1 = /^#(?:[ \t]+(.*))?$/;
const ATX_OTHER = /^#{2,6}[ \t]+(.*)$/;
const SETEXT_UNDERLINE = /^(=+|-+)[ \t]*$/;

/** Title text when the document starts with an H1 (ATX or setext); else null. */
export function extractTitle(content: string): string | null {
  const lines = content.split('\n');
  const index = firstContentLine(lines);
  if (index === null) return null;
  const line = lines[index];
  const atx = ATX_H1.exec(line);
  if (atx) {
    return (atx[1] ?? '').trim();
  }
  const underline = lines[index + 1];
  if (underline !== undefined && /^=+[ \t]*$/.test(underline)) {
    return line.trim();
  }
  return null;
}

/**
 * Ensure the document's first line is an H1 title. A heading of another level
 * (ATX or setext) is coerced to level 1; anything else gets the last-known
 * title inserted above it. Compliant content is returned unchanged.
 */
export function normalizeTitle(content: string, fallbackTitle: string): string {
  const lines = content.split('\n');
  const index = firstContentLine(lines);
  if (index === null) {
    return `# ${fallbackTitle}\n`;
  }
  const line = lines[index];

  if (ATX_H1.test(line)) {
    return content;
  }

  const other = ATX_OTHER.exec(line);
  if (other) {
    lines[index] = `# ${other[1].trim()}`;
    return lines.join('\n');
  }

  const underline = lines[index + 1];
  if (underline !== undefined && SETEXT_UNDERLINE.test(underline) && line.trim() !== '') {
    lines.splice(index, 2, `# ${line.trim()}`);
    return lines.join('\n');
  }

  return `# ${fallbackTitle}\n\n${content}`;
}

/** Index of the first non-blank line, or null when the document is blank. */
function firstContentLine(lines: string[]): number | null {
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() !== '') {
      return index;
    }
  }
  return null;
}

/** File-name stem used to seed and fall back the title. */
export function titleFromPath(relPath: string): string {
  const base = relPath.split('/').pop() ?? relPath;
  return base.replace(/\.md$/i, '');
}
