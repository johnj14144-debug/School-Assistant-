# Status

The handoff note between sessions. **Read this first and update it last.**

_Last updated: 2026-10-02 (session 3: M1 done; M2 in progress)_

## Where things stand

- **M1 is done**, including the owner's Claude CLI spike (results under "Gotchas") and the
  owner's OK on the grade rules (VISION decisions log, Q7).
  - SQLite database (`school-assistant.db` in userData) with WAL, foreign keys, and our own
    migration runner: drizzle-kit SQL embedded in the bundle, applied in one transaction,
    tracked by `PRAGMA user_version`, newer databases refused (ADR 0008). If the database can't
    be opened or migrated, the app shows an error screen and the file is left untouched.
  - Typed settings (`db/settings.ts`), daily backups (`db/backup.ts`) with folder picker,
    "Back up now", retention 14 + first of month, last success/error on the Settings page.
  - `electron-log` daily files (`main-YYYY-MM-DD.log`, 7 kept) in `app.getPath('logs')`; IPC
    failures and uncaught errors are logged.
  - Core grade math (`packages/core/src/grades/course-grade.ts`): weighted and points courses,
    optimal drop-lowest, extra credit, current/max/min, warnings. The rules are written down in
    VISION "Grade Calc" and ARCHITECTURE "Grade math".
  - Course / GradeCategory / Assignment tables, `GradesService`, and IPC channels
    (`course:*`, `category:*`, `assignment:*`, `backup:*`, `app:status|open-folder|quit`).
  - Grades page shows a temporary **debug list** of courses with current/max/min grades and an
    "Add sample course" button; M2 replaces it.
- Checked in a real Electron run (headless, Xvfb + Playwright): the DB file, the log file and
  a backup file all appear; the sample course shows 88.8% / 95.97% / 40.47% (matches hand
  math); a corrupt DB file shows the error screen and stays byte-identical.
- The owner ran `scripts/claude-cli-spike.ps1` on the laptop; every run succeeded.

## In progress: M2 — Courses & Grade Calc screens

Done so far (committed, `pnpm check` green, create-course flow checked headless):
- Core: **bonus categories** (`kind: 'bonus'`): points go straight onto the final grade, up to
  the category's weight (the cap). This follows the owner's HIST 4318 syllabus ("5 points extra
  credit can be added to your final grade"), which is now a core test case. Not counted in the
  100% of weights; empty = fully open (whole cap in the max).
- Core: `parseAssignmentLines` for bulk paste ("HW 1, 10/7, 20 pts", "Quiz 1, 9/1, 8/10 pts",
  dates/times/categories/EC in any order; due dates come back as local parts).
- DB migration `0001_category_kind` (hand-fixed, see gotchas), `assignment:create-many`
  (one transaction), service palette = the form's 8 colors.
- Renderer: `lib/dates.ts` (local date input ↔ UTC, tested across DST in America/Chicago),
  `lib/useIpc.ts`, `components/EditableCell.tsx`, `CourseForm` (name, code, term guessed
  from the date, grading type, color, letter scale presets + cutoff editor), Grades overview
  (cards grouped by term), `/grades/new`, and a basic `/grades/:courseId` page (summary,
  edit, delete; categories and assignments listed read-only). The debug list is gone.

## Next session: finish M2

1. Course page editing: categories table (name, regular/bonus, weight or cap, drop lowest,
   category grade, delete, add row; total-weight check) and assignments table (inline
   `EditableCell`s, category select, date cell that saves on blur, earned / possible, %,
   "dropped" tag from `grade.dropped`, EC checkbox, delete; add row where Enter adds and keeps
   category/points; Enter in an earned cell moves to the next row; filter by category).
2. "Paste a list" panel (textarea → `parseAssignmentLines` preview with errors → default
   category → `assignment:create-many`) and "Add a numbered series" (name, count, points,
   category, first due date, every N days).
3. Headless run entering HIST 4318 from the syllabus (6 categories + bonus, 8 video quizzes,
   13 reading responses with drop 3) to check the AC: under 5 minutes, correct current and max.
4. Docs: VISION "Grade Calc" bonus rule; ARCHITECTURE grade math + data model (`kind`);
   ROADMAP ticks; this file.

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
  `tsconfig.node.json`; `tsconfig.web.json` excludes them.
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
