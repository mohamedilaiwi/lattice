import { BlockNoteView } from '@blocknote/mantine';
import { useCreateBlockNote } from '@blocknote/react';
import { useEffect, useRef, useState } from 'react';

import { fromBlockNoteDocument, toBlockNoteDocument } from '../lib/blocknote/adapter';
import {
  latticeSchema,
  type LatticeBlockNoteBlock,
  type LatticeEditor,
  type LatticePartialBlock,
} from '../lib/blocknote/schema';
import { sha256Hex } from '../lib/markdown/hash';
import { parseMarkdown } from '../lib/markdown/parse';
import { serializeBlocks } from '../lib/markdown/serialize';
import { titleFromPath } from '../lib/markdown/title';
import type { LatticeBlock } from '../lib/markdown/types';
import { vaultApi } from '../lib/tauri';
import { useWorkspaceStore } from '../state/workspaceStore';

export function RichEditor({ paneId, relPath }: { paneId: string; relPath: string }) {
  const syncVersion = useWorkspaceStore((state) => state.notes[relPath]?.syncVersion ?? 0);
  const title = useWorkspaceStore((state) => state.notes[relPath]?.title ?? titleFromPath(relPath));
  const editNote = useWorkspaceStore((state) => state.editNote);

  const [prepared, setPrepared] = useState<{
    blocks: LatticePartialBlock[];
    generation: number;
  } | null>(null);
  const lastSerializedRef = useRef<string | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    const note = useWorkspaceStore.getState().notes[relPath];
    if (!note) return;
    // Our own edits round-trip through the store; only genuinely new content
    // (initial open, reload, save from the other pane) rebuilds the editor.
    if (lastSerializedRef.current === note.content && prepared) return;

    let cancelled = false;
    const content = note.content;
    async function prepare() {
      const hash = sha256Hex(content);
      let lattice: LatticeBlock[] | null = null;
      try {
        const cache = await vaultApi.readBlockCache(relPath);
        if (cache && cache.sourceHash === hash) {
          lattice = JSON.parse(cache.blocksJson) as LatticeBlock[];
        }
      } catch {
        // Cache is an acceleration only; fall through to a fresh conversion.
      }
      if (!lattice) {
        lattice = parseMarkdown(content);
        vaultApi.writeBlockCache(relPath, hash, JSON.stringify(lattice)).catch(() => undefined);
      }
      if (!cancelled) {
        lastSerializedRef.current = content;
        generationRef.current += 1;
        setPrepared({ blocks: toBlockNoteDocument(lattice), generation: generationRef.current });
      }
    }
    void prepare();
    return () => {
      cancelled = true;
    };
  }, [relPath, syncVersion]);

  if (!prepared) {
    return (
      <div className="conversion-state" role="status">
        Preparing rich view…
      </div>
    );
  }

  return (
    <RichEditorSurface
      key={`${relPath}:${prepared.generation}`}
      initialContent={prepared.blocks}
      fallbackTitle={title}
      onMarkdownChange={(markdownText) => {
        lastSerializedRef.current = markdownText;
        editNote(paneId, relPath, markdownText);
      }}
    />
  );
}

function RichEditorSurface({
  initialContent,
  fallbackTitle,
  onMarkdownChange,
}: {
  initialContent: LatticePartialBlock[];
  fallbackTitle: string;
  onMarkdownChange: (markdownText: string) => void;
}) {
  const editor = useCreateBlockNote({
    schema: latticeSchema,
    initialContent,
  });

  return (
    <BlockNoteView
      editor={editor}
      theme="light"
      onChange={() => {
        enforceTitleBlock(editor, fallbackTitle);
        const lattice = fromBlockNoteDocument(editor.document);
        onMarkdownChange(serializeBlocks(lattice));
      }}
    />
  );
}

/**
 * Title invariant: the first block is always a heading, always level 1, and
 * never styled. A demoted title is promoted back; a removed title is
 * re-inserted with the last-known text. Runs on every change; it mutates the
 * editor only when the invariant is actually broken.
 */
function enforceTitleBlock(editor: LatticeEditor, fallbackTitle: string): void {
  const first = editor.document[0];
  if (!first) return;
  if (first.type !== 'heading') {
    editor.insertBlocks(
      [{ type: 'heading', props: { level: 1 }, content: fallbackTitle }],
      first,
      'before',
    );
    return;
  }
  const level = Number(first.props.level ?? 1);
  const styled = titleHasStyling(first);
  if (level !== 1 || styled) {
    editor.updateBlock(first, {
      type: 'heading',
      props: { level: 1 },
      content: styled ? plainTitleText(first) : undefined,
    });
  }
}

function titleHasStyling(block: LatticeBlockNoteBlock): boolean {
  const content = block.content;
  if (!Array.isArray(content)) return false;
  return content.some((span) => {
    if (span.type === 'link') return true;
    if (span.type !== 'text') return true;
    return Object.values(span.styles ?? {}).some(Boolean);
  });
}

function plainTitleText(block: LatticeBlockNoteBlock): string {
  const content = block.content;
  if (!Array.isArray(content)) return '';
  return content
    .map((span) => {
      if (span.type === 'text') return span.text;
      if (span.type === 'link') {
        return span.content.map((inner) => ('text' in inner ? inner.text : '')).join('');
      }
      return '';
    })
    .join('');
}
