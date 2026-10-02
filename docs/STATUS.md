# Status

The handoff note between sessions. **Read this first and update it last.**

_Last updated: 2026-10-02 (session 1: brainstorm + M0)_

## Where things stand

- **M0 Foundation is done.** The app builds and launches into the sidebar shell, the IPC
  round-trip works (Settings shows version, platform and data folder), and lint, typecheck and
  tests are green.
- Nothing is stored yet: there is no database and no real features.

## Next session: Fable deep review, then M1

1. **Deep review (owner's Console credits, $13 cap).** Run the unattended review described in
   `docs/prompts/01-fable-review/` (see `docs/prompts/README.md` for the exact command). It
   verifies the plan's assumptions, writes `docs/reviews/2026-10-plan-review.md`, revises the docs,
   hardens the foundation on the owner's Windows machine, and writes `docs/prompts/next-session.md`.
2. **Then the first build session** uses `docs/prompts/next-session.md`. If the review never
   ran, start M1 (Courses & Grade Calc) directly: core grade math in
   `packages/core/src/grades/` (tests first), then Drizzle + better-sqlite3 in
   `apps/desktop/src/main/db/`, then IPC channels, then the Grades screens. Ask the owner for
   one real course syllabus to use as test data.

## Gotchas learned so far

- **Electron 44 downloads its binary lazily** on first `require('electron')` or launch, not at
  `pnpm install`. The first `pnpm dev` takes longer. To prefetch, run
  `node apps/desktop/node_modules/electron/install.js`.
- **electron-vite 5 supports Vite ≤ 7**, so Vite is pinned to 7.x and `@vitejs/plugin-react` to
  5.x. Don't bump to Vite 8 until electron-vite 6 is stable.
- **TypeScript 7** (the native compiler) is in use. Avoid removed options such as `baseUrl`;
  `paths` are relative to the tsconfig.
- **Biome 2.5**: rules are enabled with `"preset": "recommended"`. (`biome migrate` rewrote it to
  `"none"` once, which silently disables linting, so double-check after migrating.)
- **better-sqlite3 13** ships N-API prebuilt binaries (including win32-x64) inside the package.
  The spike confirmed it loads under Node 22 and Electron 44 (Node 24.21, ABI 149) with no
  compiler. `node:sqlite` also works in Electron 44, but Drizzle 0.45 has no driver for it, so
  the choice is better-sqlite3 (ADR 0005).
- `@sa/core` is a source-only workspace package (`exports` → `src/index.ts`). It must stay in
  the desktop app's **devDependencies** so electron-vite bundles it instead of externalizing it.
- pnpm prints an "Ignored build scripts: electron-winstaller" warning. It's harmless (Squirrel
  tooling we don't use).
- Headless checks in cloud sessions: run Electron under `Xvfb :99` with `--no-sandbox
  --disable-gpu`. Playwright's `_electron` works (global Playwright at
  `/opt/node-tools/node_modules/playwright` in the cloud image).

## Open questions for the user

- None blocking. For M1, get a real UH syllabus to test with.
