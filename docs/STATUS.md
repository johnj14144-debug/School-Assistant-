# Status

The handoff note between sessions. **Read this first and update it last.**

_Last updated: 2026-10-02 (session 2: applied Fable review changes C8–C12)_

## Where things stand

- **M0 Foundation is done.** The app builds and launches into the sidebar shell, the IPC
  round-trip works (Settings shows version, platform and data folder), and lint, typecheck and
  tests are green.
- **Fable review changes C8–C12 are applied** (the owner sent them as a ready-made patch for
  `0521084`, applied with `git apply`):
  - Window hardening: `src/main/security.ts` (pure, unit-tested URL policy). Only
    http/https/mailto links go to `shell.openExternal`; `will-navigate` keeps the window on the
    dev server origin or the `file://` bundle; all web permission requests are denied; the
    packaged app has no menu (so no DevTools/reload shortcuts).
  - IPC handlers are typed with the *parsed* input (`IpcParsedInput`, zod defaults applied).
  - electron-builder: `npmRebuild: false` (better-sqlite3 uses N-API prebuilds), `*.node`
    unpacked from the asar, `publish: null`.
  - CI jobs time out after 20 minutes; `tsconfig.web.json` no longer lists the nonexistent
    `src/preload/index.d.ts`.
- Nothing is stored yet: there is no database and no real features.

## Next session: rest of the Fable review, then M1

1. **The rest of the review was not attached.** Only the C8–C12 patch came in this session, so
   the summary, decisions (Q#), pitches (P#), changes C1–C7, any changes after C12, and the
   fact checks (D#) are still to do. The owner attaches `fable-review.md` and sends:
   `Apply the attached Fable review by following docs/prompts/apply-review.md.`
   C8–C12 are already in `main`: log them as "applied (from patch)" and skip them.
2. **Then M1: Courses & Grade Calc**, unless the review reshaped the roadmap. Build core grade
   math in `packages/core/src/grades/` (tests first), then Drizzle + better-sqlite3 in
   `apps/desktop/src/main/db/`, then the IPC channels, then the Grades screens. Ask the owner
   for one real course syllabus to use as test data.

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
- **Hash routing only.** `will-navigate` blocks every navigation that leaves the dev server
  origin or `file://`. In-app routes must stay hash routes, and external links must open in a
  new window (`target="_blank"`) so they reach `setWindowOpenHandler` → the default browser.
- Headless checks in cloud sessions: run Electron under `Xvfb :99` with `--no-sandbox
  --disable-gpu`. Playwright's `_electron` works (global Playwright at
  `/opt/node-tools/node_modules/playwright` in the cloud image).

## Open questions for the user

- Please attach the full `fable-review.md` so the rest of the review can be applied.
- For M1, get a real UH syllabus to test with.
