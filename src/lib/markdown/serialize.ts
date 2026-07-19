import type { InlineNode, InlineStyles, LatticeBlock, TextSpan } from './types';

/**
 * Serialize Lattice blocks to canonical Markdown. Output is deterministic:
 * serializing the parse of previously serialized output yields identical text.
 * Passthrough blocks are emitted verbatim.
 */
export function serializeBlocks(blocks: LatticeBlock[]): string {
  const parts: string[] = [];
  let index = 0;
  while (index < blocks.length) {
    const block = blocks[index];
    if (block.type === 'bulletListItem' || block.type === 'numberedListItem') {
      const run: LatticeBlock[] = [];
      const runType = block.type;
      while (index < blocks.length && blocks[index].type === runType) {
        run.push(blocks[index]);
        index += 1;
      }
      parts.push(serializeListRun(run, runType === 'numberedListItem', 0));
    } else {
      parts.push(serializeBlock(block));
      index += 1;
    }
  }
  return parts.length > 0 ? `${parts.join('\n\n')}\n` : '';
}

function serializeBlock(block: LatticeBlock): string {
  switch (block.type) {
    case 'heading':
      return `${'#'.repeat(block.level)} ${renderInlineLine(block.content)}`.replace(
        /(\s)(#+)$/,
        '$1\\$2',
      );
    case 'paragraph':
      return renderInlineLines(block.content)
        .map((line) => escapeLineStart(line))
        .join('\n');
    case 'quote':
      return renderInlineLines(block.content)
        .map((line) => (line.length > 0 ? `> ${escapeLineStart(line)}` : '>'))
        .join('\n');
    case 'callout': {
      const body = renderInlineLines(block.content)
        .map((line) => (line.length > 0 ? `> ${escapeLineStart(line)}` : '>'))
        .join('\n');
      const marker = `> [!${block.kind}]`;
      return body.length > 0 ? `${marker}\n${body}` : marker;
    }
    case 'passthrough':
      return block.markdown;
    case 'bulletListItem':
    case 'numberedListItem':
      return serializeListRun([block], block.type === 'numberedListItem', 0);
  }
}

function serializeListRun(items: LatticeBlock[], ordered: boolean, indent: number): string {
  const lines: string[] = [];
  const first = items[0];
  let ordinal = ordered && first.type === 'numberedListItem' ? (first.start ?? 1) : 1;
  for (const item of items) {
    if (item.type !== 'bulletListItem' && item.type !== 'numberedListItem') {
      continue;
    }
    const marker = ordered ? `${ordinal}. ` : '- ';
    ordinal += 1;
    const pad = ' '.repeat(indent);
    const contentPad = ' '.repeat(indent + marker.length);
    const contentLines = renderInlineLines(item.content).map((line) => escapeLineStart(line));
    const firstLine = contentLines[0] ?? '';
    lines.push(`${pad}${marker}${firstLine}`.trimEnd());
    for (const continuation of contentLines.slice(1)) {
      lines.push(`${contentPad}${continuation}`.trimEnd());
    }
    if (item.children.length > 0) {
      lines.push(serializeNestedChildren(item.children, indent + marker.length));
    }
  }
  return lines.join('\n');
}

/**
 * Children of a list item are themselves list-item runs in this model; any
 * other block type nested under an item would have come from the editor, and
 * is serialized as an indented paragraph-like line to stay valid Markdown.
 */
function serializeNestedChildren(children: LatticeBlock[], indent: number): string {
  const parts: string[] = [];
  let index = 0;
  while (index < children.length) {
    const child = children[index];
    if (child.type === 'bulletListItem' || child.type === 'numberedListItem') {
      const runType = child.type;
      const run: LatticeBlock[] = [];
      while (index < children.length && children[index].type === runType) {
        run.push(children[index]);
        index += 1;
      }
      parts.push(serializeListRun(run, runType === 'numberedListItem', indent));
    } else {
      const rendered = serializeBlock(child)
        .split('\n')
        .map((line) => `${' '.repeat(indent)}${line}`.trimEnd())
        .join('\n');
      parts.push(rendered);
      index += 1;
    }
  }
  return parts.join('\n');
}

/** Render inline content that must stay on a single line (headings). */
function renderInlineLine(content: InlineNode[]): string {
  return renderInlineLines(content).join(' ');
}

/** Render inline content into physical lines, splitting on "\n" spans. */
function renderInlineLines(content: InlineNode[]): string[] {
  const lines: string[] = [];
  let current: InlineNode[] = [];
  for (const span of content) {
    if (span.type === 'text' && span.text === '\n') {
      lines.push(renderLine(current));
      current = [];
    } else {
      current.push(span);
    }
  }
  lines.push(renderLine(current));
  return lines;
}

function renderLine(spans: InlineNode[]): string {
  return spans
    .map((span) => (span.type === 'link' ? renderLink(span) : renderStyledText(span)))
    .join('');
}

function renderLink(span: { href: string; content: TextSpan[] }): string {
  const text = span.content.map((inner) => renderStyledText(inner)).join('');
  if (span.content.length === 1 && span.content[0].text === span.href) {
    return `<${span.href}>`;
  }
  return `[${text}](${span.href})`;
}

function renderStyledText(span: TextSpan): string {
  if (span.styles.code) {
    return wrapStyled(renderCode(span.text), delimiters(span.styles));
  }
  return wrapStyled(escapeText(span.text), delimiters(span.styles));
}

/** Delimiters applied around non-code text, outermost first. */
function delimiters(styles: InlineStyles): string[] {
  const stack: string[] = [];
  if (styles.strikethrough) stack.push('~~');
  if (styles.bold && styles.italic) {
    stack.push('***');
  } else if (styles.bold) {
    stack.push('**');
  } else if (styles.italic) {
    stack.push('*');
  }
  return stack;
}

/**
 * Emphasis delimiters cannot sit against whitespace, so boundary whitespace is
 * hoisted outside the delimiters.
 */
function wrapStyled(text: string, delims: string[]): string {
  if (delims.length === 0 || text.trim().length === 0) {
    return text;
  }
  const leading = text.length - text.trimStart().length;
  const trailing = text.length - text.trimEnd().length;
  const core = text.slice(leading, text.length - trailing);
  const wrapped = delims.reduceRight((inner, delim) => `${delim}${inner}${delim}`, core);
  return `${text.slice(0, leading)}${wrapped}${text.slice(text.length - trailing)}`;
}

function renderCode(text: string): string {
  const fence = text.includes('`') ? '``' : '`';
  const padded = text.startsWith('`') || text.endsWith('`') ? ` ${text} ` : text;
  return `${fence}${padded}${fence}`;
}

/** Escape characters that would otherwise change meaning inside a line. */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/([*_[\]`~])/g, '\\$1')
    .replace(/<(?=[A-Za-z/!?])/g, '\\<')
    .replace(/&(?=[A-Za-z#])/g, '\\&');
}

/** Escape a leading character that would start a different block construct. */
function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)([#>+-])(\s|$)/, '$1\\$2$3')
    .replace(/^(\s*)(\d+)([.)])(\s|$)/, '$1$2\\$3$4')
    .replace(/^(\s*)([=-])([=-]*\s*)$/, '$1\\$2$3');
}
