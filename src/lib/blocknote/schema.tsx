import { BlockNoteSchema, defaultBlockSpecs } from '@blocknote/core';
import { createReactBlockSpec } from '@blocknote/react';

/**
 * Editor schema restricted to prototype-01's supported blocks, plus two
 * custom blocks: `callout` (Obsidian-style `> [!kind]`) and `passthrough`
 * (unsupported Markdown preserved verbatim, rendered read-only).
 */

const calloutSpec = createReactBlockSpec(
  {
    type: 'callout',
    propSchema: {
      kind: { default: 'note' },
    },
    content: 'inline',
  },
  {
    render: (props) => (
      <div className="lattice-callout" data-kind={props.block.props.kind}>
        <span className="lattice-callout-kind" contentEditable={false}>
          {props.block.props.kind}
        </span>
        <div className="lattice-callout-body" ref={props.contentRef} />
      </div>
    ),
  },
);

const passthroughSpec = createReactBlockSpec(
  {
    type: 'passthrough',
    propSchema: {
      markdown: { default: '' },
    },
    content: 'none',
  },
  {
    render: (props) => (
      <div className="lattice-passthrough" contentEditable={false}>
        <div className="lattice-passthrough-label">MARKDOWN · KEPT AS WRITTEN</div>
        <pre spellCheck={false}>{props.block.props.markdown}</pre>
      </div>
    ),
  },
);

export const latticeSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    quote: defaultBlockSpecs.quote,
    callout: calloutSpec(),
    passthrough: passthroughSpec(),
  },
});

export type LatticeEditor = typeof latticeSchema.BlockNoteEditor;
export type LatticeBlockNoteBlock = typeof latticeSchema.Block;
export type LatticePartialBlock = typeof latticeSchema.PartialBlock;
