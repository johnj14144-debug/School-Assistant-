# Status

The handoff note between sessions. **Read this first and update it last.**

_Last updated: 2026-10-03 (session 3: M1 and M2 done)_

## Where things stand

- **M1 is done:** SQLite with our own migration runner (ADR 0008), typed settings, daily
  backups with retention, `electron-log` files, core grade math, the owner's Claude CLI spike
  (results under "Gotchas") and the owner's OK on the grade rules (VISION decisions log, Q7).
- **M2 is done:** Grade Calc screens.
  - Grades overview: one card per course (current / best / worst + letter), grouped by term.
  - Add / edit / delete a course: name, code, term (guessed from the date), weighted or points,
    color, letter scale (presets + editable cutoffs).
  - Course page, all edited in place: categories (name, regular or **bonus**, weight or cap,
    drop lowest, grade so far, a "weights add up to 100%" check) and assignments (title,
    category, due date, score, possible, %, "dropped" tag, extra credit). Enter in a score
    moves to the next row's score; the add row keeps the category and points; "18/20" in a
    score sets both; a bad value reverts and shows the error in a toast. Filter by category.
  - Bulk add: **Paste a list** (`parseAssignmentLines`, live preview with per-line errors, a
    default category) and **Add a series** (`numberedSeries`: "Video Quiz 1…8", every N days),
    both saved in one transaction (`assignment:create-many`).
  - Core: bonus categories (`kind: 'bonus'`, migration `0001_category_kind`), the paste parser,
    the series generator. The owner's HIST 4318 syllabus is a core test case.
- **AC check (headless Electron, Xvfb + Playwright):** entering HIST 4318 from the syllabus
  (7 categories incl. the 5-point bonus, 8 video quizzes and 13 reading responses as two series,
  7 more by paste, 11 scores typed down the column) took 70 field entries and gave 92.81% (A-)
  current, 103.6% best, 17.6% worst, which match the hand math and the core test; 3 responses
  were tagged dropped; the data survived a restart; no page errors. A person typing that should
  finish well under 5 minutes. **The owner should still try it once on the laptop.**

## Next session: M3 — Tasks, timer & Today list

Start with the core/data side (Task, TimeSession, Completion tables + migration `0002`, a
`TasksService` and IPC), then the timer (one running task, sessions survive restart,
"I started at…" backfill), then the Today list and header widget. See ROADMAP M3 for the AC.

## Gotchas learned so far

- **pnpm runs an implicit `node-gyp rebuild` for better-sqlite3** (it has a `binding.gyp`)
  if the package is allowed to build. It is a no-op when a prebuild exists, but on Windows it
  would need Visual Studio. better-sqlite3 is therefore in `ignoredBuiltDependencies` in
  `pnpm-workspace.yaml`; the prebuilt `prebuilds/<platform>.node` loads without it.
- **Review every drizzle-kit migration before committing.** For SQLite it rebuilds a table to
  add a column with a CHECK, and its `INSERT … SELECT` copied the *new* column from the old
  table (`no such column`), so `0001` always failed until hand-fixed. The upgrade test in
  `database.test.ts` (populated v1 → latest) catches this; extend it for each migration.
- Renderer unit tests (`src/renderer/src/**/*.test.ts`) run in Node and are typechecked by
  `tsconfig.node.json`; `tsconfig.web.json` excludes them. Tests that depend on the time zone
  set `process.env.TZ = 'America/Chicago'` in `beforeAll` and import the module after it.
- **Course page edits:** every change goes through `act()` in `CoursePage.tsx` (IPC call, then
  reload). Build patches *inside* the action (`update(id, () => ({ … }))`) so a parse error
  shows in the toast instead of silently reverting the cell. Inputs in a table's add row use
  the `form` attribute to reach a `<form>` placed after the table (a form can't sit in `<tbody>`).
- Date inputs: save on blur/Enter, never on change (Chromium reports a value while the year is
  still being typed); see `components/DateCell.tsx`.
- Headless scripts: Playwright `fullPage` screenshots only show the viewport, because `<main>`
  scrolls, not the window.
- **Migrations:** after editing `src/main/db/schema.ts` run
  `pnpm --filter @sa/desktop db:generate` and commit the SQL file and `meta/`. Never edit or
  regenerate a migration once the owner has run it (from now on, `0000_init` is frozen). Biome
  ignores `src/main/db/migrations/`.
- **Drizzle (0.45, better-sqlite3 driver):** queries are synchronous (`.get()`, `.all()`,
  `.run()`), but `db.$count()` is async-only; use ``sql<number>`count(*)` `` with `.get()`.
  JSON mode turns a JS `null` into SQL NULL, so settings serialize JSON themselves.
- `VACUUM INTO ?` accepts a bound parameter (no quoting of paths needed).
- `app.setAppLogsPath()` is called right after `app.setName()`, so logs land in
  `%APPDATA%\School Assistant\logs`. The logger is set up before `whenReady`.
- **Electron 44 downloads its binary lazily** on first `require('electron')` or launch, not at
  `pnpm install`. To prefetch, run `node apps/desktop/node_modules/electron/install.js`.
- **electron-vite 5 supports Vite ≤ 7**, so Vite is pinned to 7.x and `@vitejs/plugin-react` to
  5.x. Don't bump to Vite 8 until electron-vite 6 is stable.
- **TypeScript 7** (the native compiler) is in use. Avoid removed options such as `baseUrl`;
  `paths` are relative to the tsconfig.
- **Biome 2.5**: rules are enabled with `"preset": "recommended"`. (`biome migrate` rewrote it to
  `"none"` once, which silently disables linting, so double-check after migrating.)
- **better-sqlite3 13** ships N-API prebuilt binaries (including `prebuilds/win32-x64.node`)
  inside the package and loads them from there. It works under Node 22 (tests) and Electron 44
  with no compiler (ADR 0005). `electron-builder.yml` has `npmRebuild: false` and unpacks
  `**/*.node`; confirm on the first `dist` (M8) that the `.node` file is unpacked and loads.
- `@sa/core` is a source-only workspace package (`exports` → `src/index.ts`). It must stay in
  the desktop app's **devDependencies** so electron-vite bundles it instead of externalizing it.
  Runtime packages for main (better-sqlite3, drizzle-orm, electron-log, zod) are in
  `dependencies` and stay external.
- pnpm prints an "Ignored build scripts: electron-winstaller" warning. It's harmless.
- **Hash routing only.** `will-navigate` blocks every navigation that leaves the dev server
  origin or `file://`. In-app routes must stay hash routes, and external links must open in a
  new window (`target="_blank"`) so they reach `setWindowOpenHandler` → the default browser.
- **Headless checks in cloud sessions:** build (`pnpm build`), start `Xvfb :99`, then launch
  with Playwright's `_electron` (global Playwright at `/opt/node-tools/node_modules/playwright`),
  `executablePath: apps/desktop/node_modules/electron/dist/electron`, args
  `[apps/desktop, '--no-sandbox', '--disable-gpu']`, and `HOME`/`XDG_CONFIG_HOME` pointed at a
  temp folder so userData, logs and Documents are throwaway.
- **Testing PowerShell scripts in cloud sessions:** `packages.microsoft.com` is reachable;
  download the PowerShell `.deb` from `/ubuntu/24.04/prod/pool/main/p/powershell/`, unpack with
  `dpkg -x`, and run `opt/microsoft/powershell/7/pwsh`. GitHub release downloads are blocked.
- **Windows PowerShell 5.1 strips the quotes inside JSON arguments to native programs**, so a
  hand-typed `claude --json-schema '{"type":…}'` breaks there. The spike script (and later the
  app's runner) starts the process with an exact, Windows-quoted argument string instead.
- **Claude CLI spike on the owner's laptop (2026-10-02):** Windows 11 (NT 10.0.26200),
  Windows PowerShell 5.1, Claude Code **2.1.260** (above the 2.1.259 minimum), native
  `%USERPROFILE%\.local\bin\claude.exe` (no npm shim), no `ANTHROPIC_API_KEY` in the
  environment. `claude auth status` prints JSON: `loggedIn: true`, `authMethod: "claude.ai"`,
  `apiKeySource: "/login managed key"`, and `subscriptionType: null` (so the plan can't be
  read from it). All five runs (default, `--model opus`, `--setting-sources user`,
  `--strict-mcp-config` with no servers, `--safe-mode`) returned `structured_output: {"ok":
  true}` in 3–5 s. With no `--model` the CLI used `claude-opus-5[1m]`; `--model opus` gave
  `claude-opus-5`. Each call carried about 20–26 K input tokens of overhead (`--safe-mode`
  about 5 K less); the result JSON fields are listed in ARCHITECTURE "Claude bridge". No
  usage-limit result has been seen yet; record one when it happens.
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
  Backup and log file names use the laptop's local date.

## Open questions for the user

- Does any course use excused ("EX") assignments? They aren't modeled yet.
