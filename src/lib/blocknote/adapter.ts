import type {
  HeadingLevel,
  InlineNode,
  InlineStyles,
  LatticeBlock,
  TextSpan,
} from '../markdown/types';
import type { LatticeBlockNoteBlock, LatticePartialBlock } from './schema';

/**
 * Adapt the neutral Lattice block AST to BlockNote documents and back. The
 * Markdown file stays canonical: rich edits are converted back through this
 * adapter and serialized to Markdown on save.
 */

interface BnStyledText {
  type: 'text';
  text: string;
  styles: Record<string, boolean | string>;
}

interface BnLink {
  type: 'link';
  href: string;
  content: BnStyledText[];
}

type BnInline = BnStyledText | BnLink;

export function toBlockNoteDocument(blocks: LatticeBlock[]): LatticePartialBlock[] {
  if (blocks.length === 0) {
    return [{ type: 'paragraph', content: [] } as LatticePartialBlock];
  }
  return blocks.map((block) => toBlockNoteBlock(block));
}

function toBlockNoteBlock(block: LatticeBlock): LatticePartialBlock {
  switch (block.type) {
    case 'heading':
      return {
        type: 'heading',
        props: { level: block.level },
        content: toBnInline(block.content),
      } as LatticePartialBlock;
    case 'paragraph':
      return { type: 'paragraph', content: toBnInline(block.content) } as LatticePartialBlock;
    case 'quote':
      return { type: 'quote', content: toBnInline(block.content) } as LatticePartialBlock;
    case 'callout':
      return {
        type: 'callout',
        props: { kind: block.kind },
        content: toBnInline(block.content),
      } as LatticePartialBlock;
    case 'passthrough':
      return {
        type: 'passthrough',
        props: { markdown: block.markdown },
      } as LatticePartialBlock;
    case 'bulletListItem':
      return {
        type: 'bulletListItem',
        content: toBnInline(block.content),
        children: block.children.map(toBlockNoteBlock),
      } as LatticePartialBlock;
    case 'numberedListItem':
      return {
        type: 'numberedListItem',
        content: toBnInline(block.content),
        children: block.children.map(toBlockNoteBlock),
      } as LatticePartialBlock;
  }
}

function toBnInline(content: InlineNode[]): BnInline[] {
  return content.map((span) => {
    if (span.type === 'link') {
      return {
        type: 'link',
        href: span.href,
        content: span.content.map(toBnText),
      } satisfies BnLink;
    }
    return toBnText(span);
  });
}

function toBnText(span: TextSpan): BnStyledText {
  const styles: Record<string, boolean> = {};
  if (span.styles.bold) styles.bold = true;
  if (span.styles.italic) styles.italic = true;
  if (span.styles.code) styles.code = true;
  if (span.styles.strikethrough) styles.strike = true;
  return { type: 'text', text: span.text, styles };
}

export function fromBlockNoteDocument(blocks: LatticeBlockNoteBlock[]): LatticeBlock[] {
  const result: LatticeBlock[] = [];
  for (const block of blocks) {
    result.push(...fromBlockNoteBlock(block));
  }
  return result;
}

function fromBlockNoteBlock(block: LatticeBlockNoteBlock): LatticeBlock[] {
  const children = fromBlockNoteDocument(block.children ?? []);
  switch (block.type) {
    case 'heading': {
      const rawLevel = Number(block.props.level ?? 1);
      const level = (rawLevel >= 1 && rawLevel <= 3 ? rawLevel : 3) as HeadingLevel;
      return withHoistedChildren(
        { type: 'heading', level, content: fromBnInline(block.content) },
        children,
      );
    }
    case 'quote':
      return withHoistedChildren({ type: 'quote', content: fromBnInline(block.content) }, children);
    case 'callout':
      return withHoistedChildren(
        {
          type: 'callout',
          kind: String(block.props.kind ?? 'note'),
          content: fromBnInline(block.content),
        },
        children,
      );
    case 'passthrough':
      return withHoistedChildren(
        { type: 'passthrough', markdown: String(block.props.markdown ?? '') },
        children,
      );
    case 'bulletListItem':
      return [{ type: 'bulletListItem', content: fromBnInline(block.content), children }];
    case 'numberedListItem':
      return [{ type: 'numberedListItem', content: fromBnInline(block.content), children }];
    case 'paragraph':
    default: {
      const paragraph: LatticeBlock = {
        type: 'paragraph',
        content: fromBnInline(block.content),
      };
      // Empty trailing paragraphs are an editor affordance, not content.
      if (paragraph.type === 'paragraph' && paragraph.content.length === 0) {
        return children;
      }
      return withHoistedChildren(paragraph, children);
    }
  }
}

/** Non-list blocks cannot nest in Markdown; indented children follow them. */
function withHoistedChildren(block: LatticeBlock, children: LatticeBlock[]): LatticeBlock[] {
  return children.length > 0 ? [block, ...children] : [block];
}

function fromBnInline(content: unknown): InlineNode[] {
  if (!Array.isArray(content)) {
    return [];
  }
  const spans: InlineNode[] = [];
  for (const item of content as BnInline[]) {
    if (item.type === 'link') {
      const inner = (item.content ?? [])
        .filter((text) => text.type === 'text')
        .flatMap((text) => splitTextSpan(text));
      spans.push({
        type: 'link',
        href: item.href,
        content: inner.filter((span): span is TextSpan => span.type === 'text'),
      });
    } else if (item.type === 'text') {
      spans.push(...splitTextSpan(item));
    }
  }
  return mergeAdjacent(spans);
}

/** Keep the invariant that "\n" only appears as a dedicated span. */
function splitTextSpan(text: BnStyledText): TextSpan[] {
  const styles = fromBnStyles(text.styles);
  const spans: TextSpan[] = [];
  const lines = text.text.split('\n');
  lines.forEach((line, index) => {
    if (index > 0) {
      spans.push({ type: 'text', text: '\n', styles: {} });
    }
    if (line.length > 0) {
      spans.push({ type: 'text', text: line, styles: { ...styles } });
    }
  });
  return spans;
}

function fromBnStyles(styles: Record<string, boolean | string> | undefined): InlineStyles {
  const result: InlineStyles = {};
  if (styles?.bold) result.bold = true;
  if (styles?.italic) result.italic = true;
  if (styles?.code) result.code = true;
  if (styles?.strike) result.strikethrough = true;
  return result;
}

function mergeAdjacent(spans: InlineNode[]): InlineNode[] {
  const merged: InlineNode[] = [];
  for (const span of spans) {
    const prev = merged[merged.length - 1];
    if (
      span.type === 'text' &&
      prev?.type === 'text' &&
      span.text !== '\n' &&
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

function sameStyles(a: InlineStyles, b: InlineStyles): boolean {
  return (
    !a.bold === !b.bold &&
    !a.italic === !b.italic &&
    !a.code === !b.code &&
    !a.strikethrough === !b.strikethrough
  );
}
