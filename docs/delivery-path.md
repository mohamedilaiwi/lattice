# Lattice delivery path

## Product premise

Lattice is a local-first learning workspace. It keeps the learner responsible for understanding while an opt-in agent removes organizational friction: finding related ideas, surfacing duplication, grounding research in sources, and supporting active recall.

Notes remain ordinary Markdown files in a user-selected vault. Rich-editor state, search indexes, embeddings, and application history stay local to the vault in `.lattice/`.

## Delivery principles

- Markdown is the portable, user-owned source of truth.
- Agent actions are suggestions: the user reviews and approves links, merges, and changes.
- No automatic default summarization. Prefer questions, retrieval support, relationships, prerequisites, and source-backed research.
- Private and local by default. Cloud providers are explicit, user-configured choices.
- Build reliable workspace fundamentals before agent behavior.

## Milestone 1 — Local workspace prototype

Create the desktop shell and dependable note-editing loop.

- Tauri desktop application with a Rust backend and TypeScript frontend.
- Open or create a local vault.
- File tree, Markdown note creation, file watching, and local persistence.
- Markdown editor with tabs and resizable split panes.
- Rich block editor using BlockNote, supporting headings, paragraphs, lists, quotes, callouts, and links.
- Two representations of the same note: Markdown and a cached rich-block representation.
- Conversion state when Markdown-only notes first open in rich mode.
- Same-note Markdown/rich split view and drag-to-replace panes with other notes.
- Local-only onboarding and settings shell.

Exit condition: a user can work in a vault entirely offline, edit notes in either mode, close the app, and reopen the same content without data loss or ambiguous synchronization.

## Milestone 2 — Provider and local-indexing plumbing

Add the foundation needed for useful retrieval without exposing data by default.

- Provider settings for OpenAI, Anthropic, Fireworks, and a separate web-search/retrieval provider.
- Store API keys only in the operating system keychain; never in Markdown, `.lattice/`, logs, or exported settings.
- Local SQLite metadata store in `.lattice/`.
- Whole-vault discovery and indexing, including incremental updates from file watching.
- For a vault over 250 MB of indexable content or 10,000 supported files, show a non-blocking message that initial indexing may take time and continue in the background.
- Embedding/index jobs with progress, pause, retry, and clear-index controls.

Exit condition: a configured provider can index supported vault content locally, and the user can see its status and safely remove the local index.

## Milestone 3 — Semantic vault search

Deliver the first agent-enabled capability.

- Natural-language semantic search across indexed vault content.
- Results show note path, matching excerpt, and an explanation of why it matched.
- Search stays local except for explicitly configured embedding/model calls.
- Clear empty, unavailable-provider, and partial-index states.

Exit condition: users can retrieve a relevant note or passage from a natural-language query and understand where the result came from.

## Milestone 4 — Reviewable connections

Build on retrieval to propose relationships, never silently change notes.

- Detect likely related notes and possible duplicate or overlapping sections.
- Show proposals in a per-note Connections drawer.
- Review flow: inspect evidence, compare source passages, accept, edit, dismiss, or defer.
- Accepted links are written to Markdown in a transparent, reversible form.
- A merge proposal creates a draft; original notes remain untouched until the user explicitly confirms a replacement.

Exit condition: every suggested connection has inspectable evidence and every change requires an explicit user action.

## Milestone 5 — Mentor and research workflows

Expand the agent into a configurable learning partner.

- Mentor chat grounded in user-selected notes or clearly stated vault scope.
- Web research from explicit URLs and agent-suggested searches, with inspectable citations.
- Concept and prerequisite roadmaps, such as connecting semiconductor lithography to photographic processing.
- Active-recall prompts, knowledge-gap questions, and review/flashcard suggestions.
- Configurable proactivity from onboarding and Settings.

Exit condition: the mentor helps the user plan and test learning without replacing their note-taking or presenting untraceable factual claims.

## Later milestones

- Spaced review and Anki-compatible export/import.
- More block types: tables, images, code, embeds, PDFs, and diagrams.
- Advanced source import and extraction for web pages, PDFs, video transcripts, and e-reader highlights.
- Optional encrypted sync and collaboration, designed only after the local-vault workflow is robust.
