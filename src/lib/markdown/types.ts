/**
 * Neutral block AST used for Markdown ⇄ rich conversion.
 *
 * This is deliberately independent of the BlockNote editor so conversion can
 * be tested deterministically against Markdown fixtures. The editor layer
 * adapts these blocks to BlockNote's schema.
 *
 * Anything outside the supported set round-trips through a `passthrough`
 * block that preserves the original Markdown source verbatim.
 */

export interface InlineStyles {
  bold?: true;
  italic?: true;
  code?: true;
  strikethrough?: true;
}

/**
 * Text spans never contain "\n" except as a dedicated single-character span,
 * so line-oriented serialization (quotes, callouts) can split cleanly.
 */
export interface TextSpan {
  type: 'text';
  text: string;
  styles: InlineStyles;
}

export interface LinkSpan {
  type: 'link';
  href: string;
  content: TextSpan[];
}

export type InlineNode = TextSpan | LinkSpan;

export type HeadingLevel = 1 | 2 | 3;

export interface HeadingBlock {
  type: 'heading';
  level: HeadingLevel;
  content: InlineNode[];
}

export interface ParagraphBlock {
  type: 'paragraph';
  content: InlineNode[];
}

export interface BulletListItemBlock {
  type: 'bulletListItem';
  content: InlineNode[];
  children: LatticeBlock[];
}

export interface NumberedListItemBlock {
  type: 'numberedListItem';
  content: InlineNode[];
  children: LatticeBlock[];
  /** Ordinal of the first item of a numbered run; later items count on from it. */
  start?: number;
}

export interface QuoteBlock {
  type: 'quote';
  content: InlineNode[];
}

export interface CalloutBlock {
  type: 'callout';
  /** Callout kind from the `> [!kind]` marker, lower-cased (note, tip, warning…). */
  kind: string;
  content: InlineNode[];
}

/** Unsupported Markdown preserved exactly as written. */
export interface PassthroughBlock {
  type: 'passthrough';
  markdown: string;
}

export type LatticeBlock =
  | HeadingBlock
  | ParagraphBlock
  | BulletListItemBlock
  | NumberedListItemBlock
  | QuoteBlock
  | CalloutBlock
  | PassthroughBlock;
