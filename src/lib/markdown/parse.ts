import type {
  Blockquote,
  Heading,
  List,
  ListItem,
  PhrasingContent,
  Root,
  RootContent,
} from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import type {
  CalloutBlock,
  HeadingLevel,
  InlineNode,
  InlineStyles,
  LatticeBlock,
  TextSpan,
} from './types';

const processor = unified().use(remarkParse).use(remarkGfm);

const CALLOUT_MARKER = /^\[!([A-Za-z][\w-]*)\]([ \t]*\n|[ \t]+|$)/;

/**
 * Parse Markdown into Lattice blocks. Supported syntax becomes structured
 * blocks; everything else is preserved verbatim as passthrough blocks so no
 * content is ever discarded.
 */
export function parseMarkdown(source: string): LatticeBlock[] {
  const root = processor.parse(source) as Root;
  const blocks: LatticeBlock[] = [];
  for (const node of root.children) {
    blocks.push(...convertTopLevel(node, source));
  }
  return blocks;
}

function convertTopLevel(node: RootContent, source: string): LatticeBlock[] {
  switch (node.type) {
    case 'heading': {
      const heading = convertHeading(node);
      return heading ? [heading] : [passthrough(node, source)];
    }
    case 'paragraph': {
      const content = convertInlines(node.children);
      return content ? [{ type: 'paragraph', content }] : [passthrough(node, source)];
    }
    case 'blockquote': {
      const converted = convertBlockquote(node);
      return converted ?? [passthrough(node, source)];
    }
    case 'list': {
      const converted = convertList(node);
      return converted ?? [passthrough(node, source)];
    }
    default:
      return [passthrough(node, source)];
  }
}

function convertHeading(node: Heading): LatticeBlock | null {
  if (node.depth > 3) {
    return null;
  }
  const content = convertInlines(node.children);
  if (!content) {
    return null;
  }
  return { type: 'heading', level: node.depth as HeadingLevel, content };
}

/**
 * A blockquote is a callout when its first paragraph begins with `[!kind]`.
 * Otherwise each paragraph becomes a quote block. Blockquotes containing
 * anything other than paragraphs fall back to passthrough (return null).
 */
function convertBlockquote(node: Blockquote): LatticeBlock[] | null {
  const paragraphs: InlineNode[][] = [];
  for (const child of node.children) {
    if (child.type !== 'paragraph') {
      return null;
    }
    const content = convertInlines(child.children);
    if (!content) {
      return null;
    }
    paragraphs.push(content);
  }
  if (paragraphs.length === 0) {
    return null;
  }

  const callout = extractCallout(paragraphs);
  if (callout) {
    return [callout];
  }
  return paragraphs.map((content) => ({ type: 'quote', content }));
}

function extractCallout(paragraphs: InlineNode[][]): CalloutBlock | null {
  const first = paragraphs[0];
  const lead = first[0];
  if (!lead || lead.type !== 'text' || Object.keys(lead.styles).length > 0) {
    return null;
  }
  const match = CALLOUT_MARKER.exec(lead.text);
  if (!match) {
    return null;
  }

  const rest = lead.text.slice(match[0].length);
  const body: InlineNode[] = [];
  if (rest.length > 0) {
    body.push({ type: 'text', text: rest, styles: {} });
  }
  body.push(...first.slice(1));
  for (const paragraph of paragraphs.slice(1)) {
    if (body.length > 0) {
      body.push({ type: 'text', text: '\n', styles: {} });
    }
    body.push(...paragraph);
  }
  // The marker's own line break is not part of the body: trim boundary
  // newline spans so the body always starts and ends on real content.
  while (body.length > 0 && isNewlineSpan(body[0])) {
    body.shift();
  }
  while (body.length > 0 && isNewlineSpan(body[body.length - 1])) {
    body.pop();
  }
  return { type: 'callout', kind: match[1].toLowerCase(), content: normalizeSpans(body) };
}

/**
 * Lists convert only when every item holds an optional leading paragraph plus
 * nested lists. Task-list items, multi-paragraph items, and items containing
 * other blocks make the whole list passthrough (return null).
 */
function convertList(node: List): LatticeBlock[] | null {
  const blocks: LatticeBlock[] = [];
  for (const item of node.children) {
    const converted = convertListItem(item, node);
    if (!converted) {
      return null;
    }
    blocks.push(converted);
  }
  if (node.ordered && node.start != null && node.start !== 1 && blocks.length > 0) {
    const first = blocks[0];
    if (first.type === 'numberedListItem') {
      first.start = node.start;
    }
  }
  return blocks;
}

function convertListItem(item: ListItem, list: List): LatticeBlock | null {
  if (item.checked != null) {
    return null;
  }
  let content: InlineNode[] = [];
  const children: LatticeBlock[] = [];
  for (const [index, child] of item.children.entries()) {
    if (child.type === 'paragraph' && index === 0) {
      const inlines = convertInlines(child.children);
      if (!inlines) {
        return null;
      }
      content = inlines;
    } else if (child.type === 'list') {
      const nested = convertList(child);
      if (!nested) {
        return null;
      }
      children.push(...nested);
    } else {
      return null;
    }
  }
  return list.ordered
    ? { type: 'numberedListItem', content, children }
    : { type: 'bulletListItem', content, children };
}

/** Convert phrasing content; null when any node is unsupported. */
function convertInlines(nodes: PhrasingContent[]): InlineNode[] | null {
  const spans = convertPhrasing(nodes, {});
  return spans ? normalizeSpans(spans) : null;
}

function convertPhrasing(nodes: PhrasingContent[], styles: InlineStyles): InlineNode[] | null {
  const result: InlineNode[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        result.push(...splitLines(node.value, styles));
        break;
      case 'inlineCode':
        result.push(...splitLines(node.value, { ...styles, code: true }));
        break;
      case 'break':
        result.push({ type: 'text', text: '\n', styles: {} });
        break;
      case 'strong': {
        const inner = convertPhrasing(node.children, { ...styles, bold: true });
        if (!inner) return null;
        result.push(...inner);
        break;
      }
      case 'emphasis': {
        const inner = convertPhrasing(node.children, { ...styles, italic: true });
        if (!inner) return null;
        result.push(...inner);
        break;
      }
      case 'delete': {
        const inner = convertPhrasing(node.children, { ...styles, strikethrough: true });
        if (!inner) return null;
        result.push(...inner);
        break;
      }
      case 'link': {
        if (node.title) {
          return null;
        }
        const inner = convertPhrasing(node.children, styles);
        if (!inner || inner.some((span) => span.type !== 'text')) {
          return null;
        }
        result.push({ type: 'link', href: node.url, content: inner as TextSpan[] });
        break;
      }
      default:
        return null;
    }
  }
  return result;
}

/** Split text on newlines so "\n" only ever appears as its own span. */
function splitLines(value: string, styles: InlineStyles): TextSpan[] {
  const spans: TextSpan[] = [];
  const lines = value.split('\n');
  lines.forEach((line, index) => {
    if (index > 0) {
      spans.push({ type: 'text', text: '\n', styles: {} });
    }
    if (line.length > 0) {
      spans.push({ type: 'text', text: line, styles: cloneStyles(styles) });
    }
  });
  return spans;
}

/** Merge adjacent text spans that carry identical styles. */
function normalizeSpans(spans: InlineNode[]): InlineNode[] {
  const merged: InlineNode[] = [];
  for (const span of spans) {
    const prev = merged[merged.length - 1];
    if (
      span.type === 'text' &&
      span.text !== '\n' &&
      prev &&
      prev.type === 'text' &&
      prev.text !== '\n' &&
      sameStyles(prev.styles, span.styles)
    ) {
      prev.text += span.text;
    } else {
      merged.push(span);
    }
  }
  return merged;
}

function isNewlineSpan(span: InlineNode): boolean {
  return span.type === 'text' && span.text === '\n';
}

function sameStyles(a: InlineStyles, b: InlineStyles): boolean {
  return (
    !a.bold === !b.bold &&
    !a.italic === !b.italic &&
    !a.code === !b.code &&
    !a.strikethrough === !b.strikethrough
  );
}

function cloneStyles(styles: InlineStyles): InlineStyles {
  const clone: InlineStyles = {};
  if (styles.bold) clone.bold = true;
  if (styles.italic) clone.italic = true;
  if (styles.code) clone.code = true;
  if (styles.strikethrough) clone.strikethrough = true;
  return clone;
}

function passthrough(node: RootContent, source: string): LatticeBlock {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  const markdown = start != null && end != null ? source.slice(start, end) : fallbackSource(node);
  return { type: 'passthrough', markdown };
}

/** Positions are always present for freshly parsed nodes; this is a safety net. */
function fallbackSource(node: RootContent): string {
  return `<!-- unsupported ${node.type} -->`;
}
