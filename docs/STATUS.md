# Status

The handoff note between sessions. **Read this first and update it last.**

_Last updated: 2026-10-03 (session 7: M6 re-planning built; PR open)_

## Where things stand

- **M1–M5 are done** (database, backups, log, Grade Calc, tasks, timer, Today list, calendar
  and routine, "Plan my week"). The owner can use the app daily.
- **M6 is done:** re-planning (ADR 0012; behavior in VISION "How re-planning behaves").
  - Core `scheduler/plan.ts`: one engine for both entry points. `planWeek` (fresh, unchanged
    behavior; all M5 tests pass untouched) and `replan(input + previous blocks)`: keep-then-fill
    stickiness (`chooseSticky` + `consume`), `repackUntil` (early finish re-packs today),
    `startNowTaskId` (a late task gets the first free time, cut to fit), deadline fallbacks
    (`none` → `partial` → `full`), kept blocks carry `previousId`. `scheduler/changes.ts`:
    `diffPlans`, `behindPlan`. Schemas: `planChangeSchema`, `planTriggerSchema`,
    `planBehindSchema`; `planRunSchema` gained `trigger`, `fallback`, `changes` (with defaults,
    so a stored M5 run still parses).
  - Main `PlannerService`: `planWeek()`, `replan(trigger)`, `behind()`, `notify(event)`,
    `flush()`, `tick()`; blocks sorted into frozen / movable / missed; kept blocks keep their
    rows. Task, timer and calendar services take `onPlanEvent` (`features/planner/events.ts`):
    task create/update/delete/reopen and session edits → `edit`; complete and timer stop →
    `finish` (pause → nothing); every calendar change → `edit`. Runtime builds the planner first
    and passes `planner.notify`; `index.ts` ticks `planner.tick()` every minute and forwards
    `services.replans` as the `planner:replanned` event (`ChangeSignal<T>` now carries a
    payload). Channels `planner:replan`, `planner:behind`. No migration (`block.planVersion`
    wasn't needed: re-plans keep row ids).
  - Renderer: `PlanButtons` (Re-plan now leads once a plan exists), "What moved" in the plan
    panel, `BehindBanner` on Today (polls every 30 s), `ReplanToast` (bottom right, any page,
    12 s), palette "Re-plan now"; the big Today card offers a block starting within 10 minutes.
    Wording in `planner/planText.ts` (tested).
  - Tests: replan unit tests (late start, overrun, early finish, edits, estimate up/down, new
    class, breaks, deadline fallback, steps), `changes.test.ts`, five fast-check properties for
    re-plans (15× sweep, ~22,500 runs, clean), realistic week re-planned in ~1.5 ms (~4 ms with a
    fallback), service tests (behind + Re-plan now, edits, finish/stop/pause, overrun capped by a
    class, laundry under way, new class), a fourth e2e test (finish early, an edit re-plans with a
    toast, Re-plan now).
- **Headless check (TZ=America/Chicago):** four tasks planned, planner blocks seeded 25 minutes
  late in the throwaway DB: Today showed "Behind plan: Calc HW 4 should have started 25 min ago";
  "Re-plan now" moved only Calc HW (5 of 6 blocks unchanged, 60 min now + 30 min later, no
  conflicts), the toast appeared 89 ms after the click, the banner went away and the big card
  offered Calc HW; Calendar's Re-plan now / What moved and dark mode checked; no page errors.
- `pnpm check` and `pnpm e2e` pass.

## Next session: M7 — Estimation engine

Ask the owner first (Q14–Q15 below), then:
1. Core `estimator/`: group finished tasks by course + type (History's `typeGroups` is the
   starting point); per group the actual/estimate ratio and minutes per unit (problems, pages),
   shrunk toward priors when data is thin; a ~P70 planning duration and a confidence.
2. `preparePlan` takes a duration function (estimator first, then the task's own estimate, then
   the default); reasons say which ("Planned for 2h: your Calc HW runs 1.4× your guess").
3. Task form: suggested estimate next to the estimate field (one click to use it).
4. Stats page (Reports or Tasks → History): per course and type, ratio and minutes per unit.
5. Tests: seeded histories with known statistics; the scheduler uses the estimator.

## Gotchas learned so far

- **Re-planning (M6):** previous blocks must be on the 5-minute grid (absolute epoch multiples)
  or `chooseSticky` releases them; the planner always makes aligned blocks, but a hand-seeded
  DB in a check must shift by multiples of 5 minutes. The planner writes blocks directly (not
  through `CalendarService`), so its own writes never fire plan events; keep it that way or it
  will loop. Services report plan events only after their own DB write. A waiting automatic
  re-plan runs only through the injected `schedule` (tests pass a no-op and call
  `planner.flush()`); `tick()`/`flush()` log errors instead of throwing (they run from timers).
- **CI found a latent M5 case with a fresh random seed:** kept work starting exactly at the plan's
  end isn't on the grid, so no break was left before it. `Context.workStartAfter` now carries
  it into the gap logic and the sticky check (regression tests in `plan.test.ts` and
  `replan.test.ts`). fast-check seeds change every run; replay a CI failure with
  `{ seed, path }` from the log.
- **Playwright `waitForFunction` with an async predicate resolves at once** (the promise is
  truthy). Poll from Node instead (`until()` in `e2e/smoke.e2e.ts`).
- **Ties in due date** are broken by priority, then `createdAt`, then id; tasks made in one
  service test share the fake clock's `createdAt`, so give them different due dates when the
  order matters (random UUIDs decide otherwise).
- **Scheduler (M5):** `planWeek` is pure and fast; the service does all loading. Planner rules
  must stay in step with `findBlockConflict` (the calendar flags any planner block that breaks
  them as a conflict, and the e2e/service tests assert none do). Block background-ness is
  `isBackgroundBlock(kind, attention)` everywhere; don't test `attention` alone. The property
  tests take ~4 s; a one-off sweep with 13,000 runs found nothing, so a new failure there is a
  real bug (shrink the counterexample and add a unit test).
- **Adding columns:** `ALTER TABLE ADD` appends columns, and `database.test.ts` checks that the
  migrated columns match `schema.ts` in order, so a column added that way goes at the end of
  its table in `schema.ts`. A CHECK or NOT NULL change makes drizzle-kit rebuild the table, and
  its `INSERT … SELECT` then copies new columns from the old table: hand-fix it every time
  (0001 and 0004 both needed it). Migrations run with foreign keys off and check them before
  commit, so rebuilding `task` keeps sessions, blocks and subtasks attached.
- **Due dates are required (Q11):** `taskSchema.dueAt` is a string, never null; create may
  leave it out (main fills it in). Assignments' due dates are still optional.

- **Calendar (M4):** every block write goes through core's `findBlockConflict`; fixed events
  through `fixedEventProblem`. `range()` expands over the blocks' span too, so a block reaching
  outside the range still sees its conflicts. FullCalendar gets its events only from
  `calendar:range`; drags call IPC and `info.revert()` on refusal, and a dropped task's
  temporary event is reverted before `block:create` (the real block comes back via the event).
- **FullCalendar 7:** imports are `@fullcalendar/react`, `/timegrid`, `/interaction`,
  `/themes/breezy` plus `skeleton.css`, `themes/breezy/theme.css` and a palette CSS;
  `temporal-polyfill` is a required peer. Dark mode follows the `colorScheme` option
  (`useColorScheme`). Its classes are hashed, so style through `className` on events (`sa-*`)
  and its CSS variables; slot labels are `[data-time="09:00:00"]` in tests (text is "9am").
- **Headless checks:** timestamps printed from the Node test script are in the script's zone
  (UTC), not the app's; format them inside `page.evaluate` or trust the app's own text.
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

- **Q14 — confirm the re-planning behavior chosen in M6** (VISION "How re-planning behaves").
  The choices beyond Q12–Q13: Stop on the timer counts as finishing early (Pause doesn't); an
  overrunning block grows 15 minutes at a time; "Re-plan now" after a late start starts the late
  task now and cuts it to fit before the next planned block (the rest goes later) instead of
  pushing everything after it; the plan follows every task or calendar edit on its own once a
  plan exists, with a toast saying what moved.
- **Q15 (before M7) — learned estimates:** when your estimate and the learned one differ (e.g.
  you say 1 h, your Calc HW history says 1.4×), should the planner (a) plan with the learned one
  automatically and say so, (b) plan with yours and only suggest, or (c) plan with the learned
  one only after you accept it per task? And should it plan for "enough 7 times out of 10"
  (P70) or another level?
