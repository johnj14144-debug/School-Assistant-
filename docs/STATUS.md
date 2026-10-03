# Status

The handoff note between sessions. **Read this first and update it last.**

_Last updated: 2026-10-03 (session 4: M3 done)_

## Where things stand

- **M1–M2 are done:** database, backups, log, grade math, and the Grade Calc screens (see the
  ROADMAP; HIST 4318 from the owner's syllabus is the reference course).
- **M3 is done:** tasks, the timer and the Today list. **The owner can start daily use now.**
  - Core: `tasks/` (schemas, `parseDuration`/`formatMinutes`, `parseQuickAdd`, session rules
    `findConflict`/`planStart`/`planMoveStart`, history `ownMinutes`/`rollupMinutes`/
    `typeGroups`) and `time/` (local dates and the date/time parsing moved out of the bulk-add
    parser, which now imports it).
  - DB: `task` and `time_session` (migration `0002_tasks`, plain CREATE TABLEs; the upgrade test
    covers v2 → latest). Completion lives on the task (`status`, `completed_at`,
    `completion_note`), not in a separate table (ADR 0009).
  - Main: `TasksService` (CRUD, subtasks, finish/reopen, Today list, history) and `TimerService`
    (start/pause/resume/stop, "I started at…", typed-in and edited sessions); `tasks:changed`
    event to the window; the tray menu shows the timer with Pause/Resume/Stop.
  - Renderer: timer bar on every page, Today page (Now card, hand-ordered list with drag or
    Alt+↑/↓, quick add, done today), Tasks page, task page (subtasks, sessions table, note),
    History page, Ctrl+K palette, finish and "I started at…" dialogs.
  - `apps/desktop/e2e/smoke.e2e.ts` (Playwright, `pnpm e2e`): launch, navigate, quick add, start,
    restart (timer still running), stop. CI now builds, fetches Electron and runs it on Ubuntu
    (xvfb) and Windows.
- **AC check (headless Electron):** added four tasks with Ctrl+K (course, type, estimate, due,
  quantity all parsed), started the first "15 min ago", ran laundry as a background task,
  switched tasks and moved the switch 5 minutes earlier (the previous task's time dropped from
  15 to 10 minutes), paused and resumed, finished with a note, reordered the list with Alt+↑,
  restarted the app with the timer running (still running), typed in a 75-minute session and
  moved its start, and checked History (estimate vs actual per course + type and per task). No
  page errors.
- **The owner confirmed the M3 timer and Today-list behavior** (Q9 in VISION's decisions log).
  CI on the PR ran the smoke test green on Ubuntu and Windows.

## Next session: M4 — Calendar & routine

Start with core `time/`: recurrence expansion for fixed events stored as local time + IANA zone
(ADR 0007) with tests across the March and November DST changes, then availability windows
with the 7.5 h sleep floor. Check first whether `Temporal` exists in Node 22 (tests) and
Electron 44 (app); if not, write the small zone helper ADR 0007 describes (Intl offsets), not
`Date` arithmetic on local time. Then the FixedEvent table and screens, FullCalendar views,
manual blocks, and the Today page's "current block / next up". See ROADMAP M4 for the AC.

## Gotchas learned so far

- **Timer data rules (ADR 0009):** every session write goes through core's `findConflict` /
  `planStart` / `planMoveStart`; don't insert sessions directly. Task and timer services
  normalize instants with `toISOString()` so they compare as text; zod's `iso.datetime()` also
  accepts forms without milliseconds, so normalize anything new that's compared or sorted.
- **Events from main:** add the name to `IpcEvents` in `shared/ipc.ts` *and* to the list in
  `src/preload/index.ts` (a sandboxed preload can't import runtime code from shared/). Services
  stay Electron-free and take an `onChange` callback; `index.ts` forwards it.
- **Native `<dialog>`:** its `close` event fires a tick after `close()`. Reopening right away
  would get closed by the stale event, so `Dialog` and the palette ignore `close` when the dialog
  is open again.
- **zod 4:** a default for an object input whose fields have defaults is `.prefault({})`;
  `.default({})` wants the *output* type.
- **Smoke test:** run it with `pnpm e2e` (it builds first; a stale `out/` tests old code). It
  sets `SCHOOL_ASSISTANT_DATA_DIR` so nothing touches real data; that variable also works for
  manual headless checks. The `electron` package downloads its binary synchronously on first
  `require`, so CI fetches it in its own step. Use `locator.waitFor()`, not `toBeVisible`
  (that's Playwright Test, not Vitest), and `exact: true` for labels that are substrings of
  others ("Session start" vs "New session start", "5 min ago" vs "15 min ago").
- Renderer helpers that tests import must live in `.ts` files (tests are typechecked by
  `tsconfig.node.json`, which has no JSX); see `features/tasks/format.ts`.
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
  with `_electron` from the repo's `playwright-core` (devDependency of the desktop app),
  `executablePath: apps/desktop/node_modules/electron/dist/electron`, args
  `[apps/desktop, '--no-sandbox', '--disable-gpu']`, and `SCHOOL_ASSISTANT_DATA_DIR` set to a
  temp folder. `pnpm e2e` with `DISPLAY=:99` runs the smoke test the same way.
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

- None right now. (Q9, the timer and Today-list behavior chosen in M3, was confirmed by the
  owner: "those all work". See VISION's decisions log.)
