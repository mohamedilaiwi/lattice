# Quality checks and desktop releases

## Current stage

Lattice has no hosted production service yet. The current continuous-integration pipeline verifies the codebase; it does not transmit vault content, provider keys, or user data.

Run the same baseline check locally that CI runs:

```sh
npm run check
```

It verifies Prettier formatting, ESLint, TypeScript types, tests, and the frontend build. Use `npm run fix` to apply safe formatting and lint fixes.

Use Node 20 or later; `.nvmrc` records the CI version.

When the Tauri application is added under `src-tauri/`, CI automatically enables Rust formatting, Clippy with warnings treated as errors, Rust tests, and debug desktop builds on Linux, macOS, and Windows. A secret scan runs on every CI invocation from the start.

## Pull-request policy

Protect `main` so these CI checks must pass before merge:

- TypeScript quality
- Secret scan
- Rust quality (once `src-tauri/Cargo.toml` exists)
- Desktop build on Linux, macOS, and Windows (once `src-tauri/tauri.conf.json` exists)

## Release path

The release workflow is intentionally dormant until the Tauri application exists. After the workspace prototype is in place:

1. Update the app version and changelog.
2. Merge the release-ready changes into `main` after CI passes.
3. Create and push a signed semantic-version tag such as `v0.1.0`.
4. The release workflow builds desktop artifacts for Linux, macOS, and Windows and creates a draft GitHub release.
5. Review artifacts before publishing the draft.

The first releases are intentionally unsigned. Before public distribution, add macOS notarization and Windows code-signing secrets, enable Tauri updater signing, and change the workflow to publish signed artifacts.

If Lattice later gains sync or a hosted service, its staging/production deployments must use a separate workflow and separate credentials from desktop-app packaging.
