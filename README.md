# Lattice

A local-first, agentic learning workspace. Notes are ordinary Markdown files in
a vault folder you choose; see `docs/delivery-path.md` for the roadmap and
`docs/prototype-01-workspace-design.md` for the current prototype's design.

## Development

- `npm install` — install frontend dependencies (Node 20+).
- `npm run tauri:dev` — run the desktop app (requires the Rust toolchain and,
  on Linux, the WebKitGTK development packages).
- `npm run dev` — frontend only, in a browser (shows a notice; vault access
  needs the desktop shell).
- `npm run check` — the full quality gate CI runs: format, lint, types, tests,
  build.
- `cargo test --manifest-path src-tauri/Cargo.toml --workspace` — Rust tests.

See `docs/quality-and-releases.md` for the release process.
