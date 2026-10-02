# Status

The handoff note between sessions. **Read this first and update it last.**

_Last updated: 2026-10-02 (session 2: Fable review applied)_

## Where things stand

- **M0 Foundation is done** and the Fable review is applied
  (`docs/reviews/2026-10-02-fable-review.md`, with "Verification results" and "Apply log" at
  the end):
  - VISION/ARCHITECTURE/ROADMAP were rewritten around the real Life Coach (ADR 0006) and the
    owner's answers (VISION "Decisions log"). The roadmap is re-cut into one-session
    milestones: planner core → Claude bridge → coach → phone.
  - The time rule changed: instants in UTC, recurring fixed events in local time + zone,
    Houston by default (ADR 0007).
  - The window URL policy is enforced (`src/main/security.ts`), IPC handlers get the parsed
    input type, the installer config skips native rebuilds, and CI jobs time out after 20 min.
- Nothing is stored yet: there is no database and no real features.
- Rejected pitches (all nine) are in `docs/IDEAS.md` with the owner's reasons.

## Next session: M1 — Database, backups, log, grade math

Build in this order: `electron-log` + `src/main/log.ts`; better-sqlite3 (≥ 13.0.2) + Drizzle in
`src/main/db/` (WAL, migrations, `Setting` table); the daily `VACUUM INTO` backup with a folder
setting and picker; core grade math in `packages/core/src/grades/` (tests first);
Course/Category/Assignment tables and IPC channels. Ask the owner to run the **Claude CLI
spike** from the M1 checklist on their laptop (give them exact copy-paste steps for
PowerShell; they have no coding experience) and paste the output; record the results here.
Ask for one real UH syllabus to use as test data for M2.

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
- **better-sqlite3 13** ships N-API prebuilt binaries (including `prebuilds/win32-x64.node`)
  inside the package. 13.0.2+ has no install script (13.0.0–13.0.1 ran `node-gyp rebuild`), so
  require ≥ 13.0.2. The spike confirmed it loads under Node 22 and Electron 44 (Node 24.21,
  ABI 149) with no compiler. `node:sqlite` also works in Electron 44, but Drizzle 0.45 has no
  driver for it, so the choice is better-sqlite3 (ADR 0005). `electron-builder.yml` has
  `npmRebuild: false` for this reason; confirm on the first `dist` (M8) that the `.node` file
  is unpacked and loads.
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
- **Claude CLI facts (docs, checked 2026-10-02):** `--bare` never reads the subscription login
  and is announced to become the default for `-p`; `--permission-prompts none` needs v2.1.259+;
  prompts go through stdin (argv is limited on Windows; stdin capped at 10 MB); `-p` without
  `--bare` loads `~/.claude` settings, hooks and MCP servers and any `CLAUDE.md` in the working
  folder; an `ANTHROPIC_API_KEY` in the environment overrides the subscription login, so the
  runner must strip it. See ARCHITECTURE "Claude bridge".
- **Claude plan watch item:** Anthropic announced, then paused (2026-06-15), a change that would
  move `claude -p` usage off the plan limits onto a separate monthly Agent SDK credit ($20 on
  Pro). Today `-p` still uses the plan limits. Re-check the support article "Use the Claude
  Agent SDK with your Claude plan" before M9.
- **Time:** instants in UTC; recurring fixed events in local time + IANA zone (ADR 0007).

## Open questions for the user

- Result of the Claude CLI spike (M1 checklist). Not blocking for M1's code.
- One real UH syllabus for M2 test data.
