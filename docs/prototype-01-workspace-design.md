# Lattice prototype 01 — local workspace

## Purpose

Prototype 01 validates Lattice's central editing experience before any agent feature is implemented: a local Markdown vault can be opened and edited comfortably in either raw Markdown or a Notion-like block editor.

It must feel like one workspace with two complementary views of the same user-owned note, rather than a Markdown app with a separate rich-text import mode.

## Scope

### In scope

- Tauri desktop app for macOS, Windows, and Linux.
- User selects an existing local folder as a vault or creates an empty vault.
- Markdown files are the canonical user content.
- File tree, note creation, rename, open, save, and external file-change detection.
- Tab strip, including closing and reopening notes.
- Resizable split panes.
- Raw Markdown editor and rich BlockNote editor.
- Supported rich blocks: heading, paragraph, bulleted list, numbered list, quote, callout, and internal/external links.
- A cached block representation, managed locally under `.lattice/`.
- Settings shell and local-onboarding shell; no provider calls or API-key collection yet.

### Explicitly out of scope

- LLM calls, embeddings, semantic search, duplicate detection, mentor chat, or web research.
- Cloud sync, collaboration, accounts, and telemetry.
- Tables, media, PDF embeds, code blocks, diagrams, and complex Notion-compatible blocks.
- Automatic file merges when the same content changes externally and in the editor.

## Information architecture

```text
Lattice app window
├── Activity rail
│   ├── Vault
│   ├── Search (placeholder)
│   ├── Graph (placeholder)
│   └── Settings
├── Vault sidebar
│   ├── Vault name
│   ├── Create note / folder controls
│   └── Folder tree
├── Workspace
│   ├── Tab strip
│   └── One or more editor panes
│       ├── Note toolbar
│       ├── Rich editor or Markdown editor
│       └── Save / conversion state
└── Status bar
    ├── Vault location/status
    └── Save state
```

The prototype reserves, but does not implement, a right-hand agent drawer. This avoids a later layout rewrite while preserving a calm, document-first experience now.

## Primary interaction flows

### Open a vault

1. On first launch, the user chooses **Open vault** or **Create vault**.
2. Lattice records the approved local folder as the active vault.
3. The file tree displays supported Markdown notes and folders.
4. The app writes application-only state under `<vault>/.lattice/`; user notes remain elsewhere as ordinary `.md` files.

### Open and edit a Markdown note

1. Selecting a note opens it in the active pane and creates or activates a tab.
2. The default presentation is rich mode for a new Lattice note; an imported/external Markdown note may initially open in Markdown mode while its rich state is prepared.
3. In Markdown mode, edits write to the note's `.md` file using an atomic save.
4. Lattice updates the cached rich representation after a debounced successful save.

### Convert an existing Markdown note to rich mode

1. The user selects **Rich** in the note toolbar.
2. If the Markdown content hash has no current cached block representation, the pane displays a short inline state: **Preparing rich view…**.
3. Lattice parses supported Markdown into BlockNote blocks and caches the result in `.lattice/`.
4. Unsupported syntax is preserved as readable Markdown-compatible text instead of being discarded.
5. The rich view replaces the conversion state. The user can return to Markdown at any time.

### Edit in rich mode

1. Block edits update the in-memory document.
2. After a debounce, Lattice serializes supported blocks to canonical Markdown and atomically saves the `.md` file.
3. The saved Markdown hash becomes the current source version for that rich cache.
4. A compact status indicator changes from **Saving…** to **Saved locally**.

The cached block version is an acceleration and fidelity aid, not an opaque second source of truth. When its source hash differs from the Markdown file, Lattice rebuilds it from Markdown.

### Split a note

1. The user selects **Split pane** from the note toolbar.
2. Lattice creates a second pane with the same note.
3. By default, the original remains in rich mode and the new pane opens in Markdown mode; if the original is Markdown, reverse the defaults.
4. Both panes reflect completed saves from the other view. During active typing, show a small synchronization indicator rather than overwriting the other editor mid-keystroke.

### Compare notes in split view

1. The user drags a tab or file-tree item onto a pane.
2. That pane opens the dragged note while the other pane remains unchanged.
3. Each pane has independent mode, tab focus, and scroll position.

### External file changes

1. The file watcher detects a `.md` change outside Lattice.
2. If the note is not dirty, Lattice reloads it and invalidates stale block cache.
3. If the note has unsaved local edits, Lattice does not overwrite content. It presents **Review external change** with options to reload, keep local copy, or compare.

## Visual direction

- Desktop-first, calm, and dense enough for serious study.
- Soft near-white editing surface, warm gray navigation panels, charcoal typography, and restrained indigo for selections and links.
- Agent space is peripheral; the editor remains the visual and interaction focus.
- Familiar conventions: sidebar file tree, document tabs, resizable editor splits, keyboard-first navigation.
- Avoid a chat-first homepage, decorative gradients, and large generated-summary cards.

## Persistence layout

```text
<vault>/
├── Semiconductor Lithography.md
├── Chemistry/
│   └── Photoresist.md
└── .lattice/
    ├── workspace.sqlite       # tabs, pane layout, note metadata
    ├── blocks/                # cached block representation by note id
    ├── hashes/                # source-version metadata
    └── settings.json          # non-secret local preferences
```

No API keys, plaintext credentials, embeddings, or remote-sync data belong in a note file. Provider credentials will later use the operating system keychain; semantic indexes will be added only in the indexing milestone.

## Conversion constraints

- Preserve the original Markdown whenever conversion is uncertain.
- Favor a lossless readable fallback over a perfect rich rendering.
- Never silently erase unsupported syntax.
- Internal links serialize predictably as Markdown links or chosen wiki-link syntax, according to vault settings added in a later iteration.
- Conversion and saves need deterministic tests using Markdown fixtures.

## Acceptance criteria

1. A user can select a local folder, create a note, restart the app, and reopen the same vault without losing content or layout.
2. A Markdown-only note can open in rich mode after a visible, brief conversion state.
3. Edits made in either mode persist as valid Markdown and appear in the other mode after save synchronization.
4. Split pane opens the same note in rich/Markdown modes by default; dragging another note into a pane makes it a two-note view.
5. External changes do not silently overwrite unsaved work.
6. The app works with no network access and sends no user content externally.
7. The prototype has automated tests for Markdown/block conversion and save-conflict behavior.

## Open implementation decisions

- Choose the Markdown parser/serializer and define a fixture suite before implementing two-way conversion.
- Decide whether internal links default to standard Markdown or wiki-link syntax; preserve existing forms when opening a vault.
- Decide the exact local database library and file-watcher implementation for Tauri/Rust.
- Determine the precise behavior for simultaneous typing in both views of the same note; prototype 01 can synchronize on debounced save rather than character-level collaboration.
