# CLAUDE.md

Lattice is a local-first learning workspace. See `docs/delivery-path.md` for the
roadmap and `docs/prototype-01-workspace-design.md` for the workspace spec.

## Commands

- `npm run check` — the full local gate, identical to CI: Prettier check, ESLint
  (`--max-warnings=0`), TypeScript typecheck, Vitest, and the frontend build.
  Run it before considering any change done.
- `npm run fix` — apply safe Prettier and ESLint fixes.
- Use Node 20 or later (`.nvmrc` records the CI version).
- Once `src-tauri/` exists, CI additionally runs `cargo fmt --check`, Clippy
  with warnings treated as errors, Rust tests, and debug desktop builds on
  Linux, macOS, and Windows.

## Product invariants (do not violate)

- Markdown files in the user's vault are the canonical, user-owned content.
  Everything app-generated — block cache, hashes, indexes, SQLite, local
  settings — lives under `<vault>/.lattice/`, never in note files.
- Never write API keys, credentials, embeddings, or sync data into notes,
  `.lattice/`, logs, or exported settings. Provider keys belong in the OS
  keychain only.
- Agent actions are suggestions that require explicit user approval. No silent
  note edits, no automatic summarization.
- Local and private by default: no network calls carrying user content unless
  the user explicitly configured a provider for that purpose.
- Markdown ⇄ rich-block conversion must never silently discard unsupported
  syntax. Preserve the original Markdown as a readable fallback whenever
  conversion is uncertain.
- External file changes must never overwrite unsaved editor work; present a
  review choice instead.
- Every note's first line is its H1 title (Obsidian/Notion convention). It is
  seeded from the file name at creation and its format is locked — never
  another heading level, never styled. Editing the title text never renames
  the file (and renaming never rewrites the title). Enforced on edit via
  `src/lib/markdown/title.ts` and the rich editor's title guard — never on
  load, so merely opening a file cannot rewrite it.

## Engineering conventions

- TypeScript is strict; ESLint runs with `--max-warnings=0`; Prettier formats
  everything. Tests use Vitest.
- Rust (once present) is formatted with rustfmt and must be Clippy-clean with
  warnings as errors.
- Note saves are atomic (write temp file, then rename) and carry the expected
  base-content hash so conflicts are detected, not clobbered.
- The cached block representation is an acceleration, not a second source of
  truth: when its source hash differs from the Markdown file, rebuild it from
  Markdown.
- Markdown/block conversion and save-conflict behavior require deterministic,
  fixture-based tests (`src/lib/markdown/fixtures/`).

## UI conventions (from the prototype-01 design handoff)

- Design tokens (colors, type scale, radii, shadows) live at the top of
  `src/styles.css` and are the source of truth — new UI must use those custom
  properties, not ad-hoc values. 1px borders over shadows; shadows only on
  overlays; no decorative animation except the "Preparing rich view…" pulse.
- The workspace is 1–2 VSCode-style **editor groups**, each with its own tab
  strip. Every tab has a per-tab **view**: `markdown`, `rich`, or `split`
  (split = rich + Markdown of the same note inside one group). A second group
  is created only by dragging a tab/tree note onto the right 45% of a single
  group; a group disappears when its last tab closes (always ≥ 1 group).
- Settings is a **modal** over the workspace (General / Editor / Providers),
  not a route; Search and Graph swap the sidebar content only. Keyboard:
  ⌘/Ctrl+E toggles Rich↔Markdown, ⌘/Ctrl+\ toggles Split, Esc closes the
  settings modal.
- The sidebar tints only notes that are a group's _active_ tab; the vault name
  header hosts new-note/new-folder; creation is an inline input at the top of
  the tree (also triggered from an empty group's "＋ New note").
- Icons are inline stroke SVGs in `src/components/icons.tsx` — no icon fonts
  or external assets. Inter is bundled via BlockNote's font CSS.
- A 14px right-edge strip reserves space for the future agent drawer; the
  editor stays the visual focus.

## Open implementation decisions

The design docs deliberately leave some choices open. When you hit one that is
still undecided, surface it to the user instead of silently picking. Current
defaults chosen for prototype 01 (revisit freely with the user):

- Markdown parsing uses remark (unified/mdast) with a hand-written,
  deterministic serializer; unsupported syntax round-trips verbatim through
  passthrough blocks.
- Internal links default to standard Markdown links; existing forms in a vault
  are preserved as written.
- Local metadata store is SQLite via `rusqlite` (bundled); the file watcher is
  the `notify` crate.
- Simultaneous editing of both views of one note synchronizes on debounced
  save, not per-keystroke.
