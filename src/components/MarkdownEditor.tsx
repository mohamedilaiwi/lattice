import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { minimalSetup } from 'codemirror';
import { useEffect, useRef } from 'react';

import { useWorkspaceStore } from '../state/workspaceStore';

/** Light syntax tinting per the design: indigo structure, muted quotes,
 * warm inline code. */
const latticeHighlight = HighlightStyle.define([
  { tag: tags.heading, color: '#4f5b93', fontWeight: '600' },
  { tag: tags.processingInstruction, color: '#4f5b93' },
  { tag: tags.list, color: '#4f5b93' },
  { tag: tags.quote, color: '#6f6b64' },
  { tag: tags.monospace, color: '#8a5a35' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '650' },
  { tag: tags.link, color: '#4f5b93' },
  { tag: tags.url, color: '#6f6b64' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
]);

export function MarkdownEditor({ paneId, relPath }: { paneId: string; relPath: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const gutterRef = useRef(new Compartment());
  const syncVersion = useWorkspaceStore((state) => state.notes[relPath]?.syncVersion ?? 0);
  const showLineNumbers = useWorkspaceStore((state) => state.settings.lineNumbers);
  const editNote = useWorkspaceStore((state) => state.editNote);
  const flushNote = useWorkspaceStore((state) => state.flushNote);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const store = useWorkspaceStore.getState();
    const content = store.notes[relPath]?.content ?? '';
    const view = new EditorView({
      state: EditorState.create({
        doc: content,
        extensions: [
          minimalSetup,
          gutterRef.current.of(store.settings.lineNumbers ? lineNumbers() : []),
          markdown(),
          syntaxHighlighting(latticeHighlight),
          EditorView.lineWrapping,
          keymap.of([
            {
              key: 'Mod-s',
              run: () => {
                void flushNote(relPath);
                return true;
              },
            },
          ]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              editNote(paneId, relPath, update.state.doc.toString());
            }
            if ((update.selectionSet || update.focusChanged) && update.view.hasFocus) {
              const head = update.state.selection.main.head;
              const line = update.state.doc.lineAt(head);
              useWorkspaceStore
                .getState()
                .setCursor({ line: line.number, col: head - line.from + 1 });
            }
          }),
        ],
      }),
      parent: container,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // The editor instance lives for the tab's lifetime in this pane.
  }, [paneId, relPath, editNote, flushNote]);

  // Toggle the line-number gutter in place when the setting changes.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: gutterRef.current.reconfigure(showLineNumbers ? lineNumbers() : []),
    });
  }, [showLineNumbers]);

  // Resynchronize when content is replaced from outside this editor (reload,
  // external change, a completed save from the other view, or title
  // normalization). Dispatch only the differing span so the cursor survives —
  // e.g. re-inserting the H1 title above text the user is actively typing.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const content = useWorkspaceStore.getState().notes[relPath]?.content ?? '';
    const current = view.state.doc.toString();
    if (current === content) return;
    let start = 0;
    const minLength = Math.min(current.length, content.length);
    while (start < minLength && current[start] === content[start]) start += 1;
    let currentEnd = current.length;
    let contentEnd = content.length;
    while (
      currentEnd > start &&
      contentEnd > start &&
      current[currentEnd - 1] === content[contentEnd - 1]
    ) {
      currentEnd -= 1;
      contentEnd -= 1;
    }
    view.dispatch({
      changes: { from: start, to: currentEnd, insert: content.slice(start, contentEnd) },
    });
  }, [relPath, syncVersion]);

  return <div className="markdown-editor" ref={containerRef} />;
}
