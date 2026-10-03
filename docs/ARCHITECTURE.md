# Architecture

How the system fits together and where things go. The reasons behind the big choices are in
[`decisions/`](decisions/). This file describes the target design. Parts not yet built are
marked with the milestone that adds them (see [ROADMAP.md](ROADMAP.md)).

## Big picture

```
 Windows laptop                                          Cloud (free tier)          iPhone
┌──────────────────────────────────────────────┐      ┌──────────────────────┐   ┌──────────┐
│ Electron app (apps/desktop)                  │      │ Relay (apps/relay)   │   │ Telegram │
│                                              │ HTTPS│ Cloudflare Worker    │   │   app    │
│  Renderer (React UI) ──IPC── Main process ───┼─poll─┤  + D1 (SQLite)       ├───┤          │
│                              │   │   │       │      │  + cron (every min)  │   │          │
│                              │   │   └ tray, │      │ reminders outbox     │   └──────────┘
│                              │   │     toasts│      │ phone-events inbox   │
│                     SQLite ──┘   │           │      └──────────────────────┘
│                  (better-sqlite3)│           │                 M14
│                                  │ spawn     │
│                       `claude -p` (user's    │
│                        Claude Code, Pro plan)│  M9
└──────────────────────────────────────────────┘
```

- **Renderer**: React screens. It has no Node access and only talks to main through
  `window.api` (typed IPC: `invoke`, and `on` for events from main). It never navigates away
  from the app and can only open `http(s)`/`mailto` links in the system browser
  (`src/main/security.ts`). In-app routes are hash routes.
- **Main process**: owns the database, backups, the log, the scheduler runs, the timer, the AI
  job queue, the relay sync, the tray and notifications.
- **`packages/core`**: pure TypeScript domain logic with no I/O: zod schemas, grade math,
  recurrence expansion, the scheduler, the estimator, the coach's deterministic parts
  (feasibility arithmetic, roadmap date planning, unit → task decomposition). Used by main, the
  renderer and the relay. Most tests live here.
- **Relay** (M14): a tiny always-on mailbox, so the phone works while the laptop sleeps.

## Repository layout

```
packages/core/src/
  grades/        letter scales, course grade math (M1), bulk-paste parser and numbered
                 series for adding assignments (M2)
  retention/     which dated backups and logs to keep (M1)
  tasks/         task and session schemas, durations, the quick-add parser, timer session rules,
                 estimate-vs-actual history (M3)
  time/          local dates and typed date/time parsing (M2–M3); zone helper, RRULE subset,
                 recurrence expansion with time zones, availability windows (M4)
  calendar/      fixed event and block schemas, block overlap rules, "now / next" (M4)
  scheduler/     time-blocking + re-planning (M5–M6)
  estimator/     duration learning (M7)
  coach/         feasibility math, roadmap date planning, decomposition to tasks (M11–M12)
  schemas/       shared zod schemas for domain objects and for Claude's structured outputs
apps/desktop/
  electron.vite.config.ts  electron-builder.yml  resources/ (icons)
  e2e/           Playwright smoke test of the built app (M3; `pnpm e2e`)
  src/main/      index.ts (window, tray, lifecycle), security.ts (URL policy), ipc.ts
                 (validated dispatcher), handlers.ts (composes per-feature handler objects),
                 runtime.ts (opens the DB, builds services), log.ts,
                 db/ (schema, migrations/, migrate, database, settings, backup),
                 features/<name>/ (services + that feature's IPC handlers),
                 tray.ts (tray menu with the timer), ai/ (claude runner + job queue, M9),
                 test/ (test helpers)
  src/preload/   exposes window.api (contextIsolation + sandbox on)
  src/shared/    ipc.ts: the IPC contract, imported by main, preload and renderer
  src/renderer/src/
                 App.tsx (layout), routes.tsx (sidebar + pages), features/<name>/ (screens),
                 components/ (shared UI), lib/
apps/relay/      Cloudflare Worker (M14)
```

**Convention:** a feature lives in three places: domain logic in `packages/core/src/<feature>/`,
a service plus its IPC handlers in `apps/desktop/src/main/features/<feature>/` (exported as a
partial `IpcHandlers` object that `handlers.ts` spreads together), and screens in
`apps/desktop/src/renderer/src/features/<feature>/`. If logic can be pure, it goes in core.

## Typed IPC

`apps/desktop/src/shared/ipc.ts` declares every channel with zod `input`/`output` schemas.
`createIpcDispatcher` validates both directions, and `IpcHandlers` makes a missing handler a
compile error. Handlers receive the *parsed* input (`IpcParsedInput`), so defaults and
transforms in the schema apply. To add a call:

1. Add the channel to `ipcContract`.
2. Implement it in the feature's handler object, which `src/main/handlers.ts` includes.
3. Call `window.api.invoke('<channel>', input)` from the renderer. It is fully typed.

Handler errors are logged in main (`log.ts`) before Electron forwards them to the renderer.

**Events (main → renderer, M3).** `IpcEvents` in the same file lists what main can push; the
preload exposes `window.api.on(event, listener)` for an allowlist of those names (a sandboxed
preload can't import the contract, so the names are repeated there). `tasks:changed` is sent
after any task, Today-list or timer change from anywhere (a page, the tray); `calendar:changed`
(M4) after any fixed event or block change. Renderer pages read through `useLiveQuery`, which
reloads on both (ADR 0009).
Feature handler objects are typed `HandlersFor<'prefix'>` (every channel starting with that
prefix). If the database fails to open, only the `app:*` channels work and the renderer shows
an error screen (`app:status`).

## Storage, backups and logging (M1)

- `SCHOOL_ASSISTANT_DATA_DIR` (tests only) moves userData, logs and the default backup folder
  to another folder, so a test run never touches real data.
- SQLite in `%APPDATA%/School Assistant/school-assistant.db` (`app.getPath('userData')`),
  `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, opened by `db/database.ts`.
- **Migrations** (ADR 0008): drizzle-kit writes SQL from `db/schema.ts`
  (`pnpm --filter @sa/desktop db:generate`); the files are embedded in the bundle and
  `db/migrate.ts` applies the pending ones in one transaction, tracked by `PRAGMA user_version`.
  A failure rolls back, leaves the file untouched and shows the error screen; a database newer
  than the app is refused.
- **Settings** (`db/settings.ts`): typed keys, each with a zod schema and default, stored as
  JSON text in the `setting` table.
- **Backup** (`db/backup.ts`): `VACUUM INTO '<folder>/school-assistant-YYYY-MM-DD.db'` (local
  date), written as `….partial` and renamed when complete. Checked a minute after startup and
  every 30 minutes; runs when today's file is missing from the folder; "Back up now" replaces
  today's file. Keeps the newest 14 dated files plus the earliest of every month
  (`datesToPrune` in core); other files in the folder are never touched. The folder is the
  `backup.folder` setting, default `Documents\School Assistant Backups`; picking a folder in
  Settings backs up into it first, so an unwritable folder is rejected. The last success and
  the last error are settings shown on the Settings page.
  Restore = quit, delete the live DB and its `-wal`/`-shm` files, copy the backup in under the
  live name, relaunch (M8 adds the UI).
- **Log** (`log.ts`): `electron-log` to `app.getPath('logs')` as `main-YYYY-MM-DD.log`, 7 days
  kept, `info` by default; uncaught errors are logged. Every AI job writes its command line
  (without prompt text), duration, usage and outcome.
- The database and logs are never committed.

## Data model (target)

Built a little per milestone with Drizzle migrations. Instants are UTC ISO strings; recurring
events keep local time + IANA zone (ADR 0007); durations are minutes.

| Entity | Key fields | Milestone |
|---|---|---|
| Setting | key, value (JSON) | M1 |
| Course | name, code, term, kind (`enrolled`/`self_study`), grading (`weighted`/`points`), letterScale (JSON), color, createdAt, updatedAt; goalId?, milestoneId?, primaryMaterialIds added in M12 | M1 |
| GradeCategory | courseId, name, kind (`regular`/`bonus`, M2), weight (percent; a bonus category's cap in percentage points), dropLowest, position | M1 |
| Assignment | courseId, categoryId? (set null if the category is deleted), title, dueAt?, pointsPossible, pointsEarned?, extraCredit, createdAt, updatedAt; unitId? added in M12 | M1 |
| Task | title, description, parentId? (subtasks; cascade delete), courseId? (set null), assignmentId? (set null; sets the course), type (free text), quantity+unit, estimateMin, dueAt?, priority (`low`/`normal`/`high`), attention (`focus`/`light`/`background`), todayOrder? (on the Today list when set), status (`open`/`done`), completedAt?, completionNote, createdAt, updatedAt; unitId? in M12; earliestStart?, splittable, minChunkMin, steps in M5 | M3 |
| TimeSession | taskId (cascade), startAt, endAt? (null = running), source (`desktop`/`phone`/`manual`) | M3 |
| FixedEvent | title, kind (`class`/`sleep`/`meal`/`hygiene`/`other`), courseId? (set null), location, startDate (DTSTART, local), startLocal, endLocal (≤ start = next day), rrule? (null = once), timeZone, exceptions (skipped local dates, JSON) | M4 |
| Block | taskId? (cascade), title, startAt, endAt, locked, source (`manual`/`planner`), reason; planVersion in M6 | M4–M6 |
| AiJob | kind, priority, modelAlias, sessionId, stage, status (`queued`/`running`/`waiting_for_reset`/`done`/`failed`/`cancelled`), input, output, usage, costEstimate, resumeAfter, attempts | M9 |
| LearnerProfile | user notes ("How I learn"), Claude-maintained teaching guide, version | M11 |
| Goal | title, why, deadline, kind (`exam`/`skill`/`project`/`other`), status | M11 |
| GoalProfile | goalId, intake answers (JSON), diagnostic results, weeklyHours, version | M11 |
| ResearchDossier | goalId, version, stages[] {name, status, sessionId, markdown, data}, levels[] {name, markers, hoursLow, hoursHigh, sources}, approvedAt | M11 |
| Material | goalId?, kind (`textbook`/`course`/`pdf`/`link`/`video`/`problem_set`/`note`), title, author, url, isbn?, verifiedAt?, ownedByUser, path? | M11 |
| Citation | dossierId, url, title, fetchedAt, quote | M11 |
| Roadmap | goalId, version, feasibility {hoursNeeded, hoursAvailable, projectedFinish, warning?}, approvedAt | M12 |
| Phase | roadmapId, order, title, goalOfPhase | M12 |
| Milestone | phaseId, kind (`course`/`project`/`competition`/`assessment`/`habit`/`reading`), title, doneWhen, hours, startBy, dueBy, dependsOn[], status, impact {how, strength (`strong`/`some`/`weak`), sources}, courseId?, materialIds[], competition {url, cadence, nextDate, eligibility}? | M12 |
| Unit | courseId, order, title, kind (`reading`/`project`/`assessment`/`gap_lesson`), materialRefs[] {materialId, locator, exercises}, gapReason?, hours, startBy, dueBy | M12 |
| Assessment | unitId, kind (`homework`/`quiz`/`placement`/`practice_exam`/`exam`/`project`), dueAt, points, content, answerKey, rubric, scores per question/topic | M13 |
| Lesson | unitId (gap units only), markdown, teachingGuideVersion | M13 |
| Feedback | unitId/assessmentId, rating, comment, appliedToGuideVersion | M13 |
| CoachNote | goalId?, text, source (`app`/`phone`/`feedback`) | M11 |
| RelayCursor / Reminder / PhoneEvent | sync state with the relay | M14 |
| Report | kind (`weekly_research`/`weekly_review`), weekOf, markdown, data | M16 |

## Grade math (M1, `packages/core/src/grades`)

`courseGrade({ grading, categories, assignments })` returns current, max and min percents with a
per-category breakdown and warnings.

- **Weighted:** a category's percent pools its points (earned / possible); the course grade is
  the weight-averaged category percent. **Points:** everything pools; weights are ignored.
- **Current** uses graded work only, renormalizing weights over graded categories. **Max** puts
  100% on everything ungraded; **min** puts 0%. A weighted category with nothing entered is
  fully open (100% for max, 0% for min).
- **Drop lowest** (per category, both grading types) removes the scores whose removal raises
  the category most (exact, via Dinkelbach's method), always keeping one. For the current grade
  it drops among graded work only.
- **Extra credit:** earned above possible counts; an `extraCredit` assignment adds its earned
  points without adding its possible points, is never dropped, and counts at full value in the
  max only.
- **Bonus categories** (`kind: 'bonus'`, M2): for syllabi like "up to 5 points of extra credit
  added to your final grade". Earned points in the category are added to the final percent one
  for one, capped at the category's weight, in both grading types. They are not part of the
  100% of weights. Empty bonus category: the whole cap in the max, 0 in current and min.
- Warnings: weights not summing to 100 (weights are renormalized), uncategorized assignments in
  a weighted course (ignored). Results are rounded at 1e-10 so float noise can't cost a letter.

**Entering grades (M2).** The course page (`renderer/src/features/grades/CoursePage.tsx`)
edits categories and assignments in place (`EditableCell`: Enter or leaving the cell saves,
Escape cancels, a rejected value reverts and the error shows in a toast). Every change goes
through one `act()` that calls IPC and then reloads `course:get`, so the grades shown always
come from core. Bulk add uses two pure core helpers, `parseAssignmentLines` (pasted
"HW 1, 10/7, 20 pts" lines) and `numberedSeries` ("Video Quiz 1…8", every N days); both return
local wall-clock due dates, which the renderer turns into UTC instants (ADR 0007), and save
through `assignment:create-many` in one transaction.

## Tasks, timer and Today list (M3)

- **Tasks** (`features/tasks/service.ts`): subtasks of any depth (a subtask takes its parent's
  course and type unless given), an assignment link that brings its course, completion with a
  note (finishing stops the timers of the task and its subtasks), and the Today list
  (`todayOrder`; unfinished tasks stay on it until done or removed). Open tasks sort by due date,
  then priority, then age.
- **Timer** (`features/tasks/timer.ts`, ADR 0009): an open `time_session` is a running timer.
  One focus/light task at a time, background tasks alongside; pause remembers the task in the
  `timer.paused` setting. "I started at…" starts (or moves a running start) in the past; typed
  times may be a minute ahead of the clock. All session writes go through core's
  `findConflict`/`planStart`/`planMoveStart` (no overlapping focus sessions, sessions end after
  they start). Error messages name the conflicting session in local time.
- **Views**: `TaskSnapshot` loads every task, session and course reference once per call and
  computes own and rolled-up minutes (`ownMinutes`, `rollupMinutes` in core). Today's focus time
  counts focus/light sessions since local midnight. **History** groups finished tasks by
  course + type (`typeGroups`): time spent is each task's own time; estimate vs actual measures a
  task tree once, at the highest finished task that has an estimate.
- **Quick add** (`parseQuickAdd` in core): due shortcuts (today, tomorrow, fri, next fri,
  in 3 days, 10/7, Oct 7, 5pm), `~90m` estimate, `!` priority, `#course`, `@type`, and
  quantities ("12 problems", "pages 45-60") that stay in the title; quoted text is literal.
  The renderer parses as you type (preview chips) and sends a normal `task:create`.
- **UI**: a timer bar above every page (`TimerBar`), the Today page's Now card and hand-ordered
  list, the Ctrl+K palette (add; Ctrl+Enter adds and starts; find a task to start or open; timer
  commands; navigation), and the tray menu (running/paused task with Pause/Resume/Stop, refreshed
  on every change and every 30 s). Shared actions and their dialogs (finish note, "I started
  at…") live in `TaskActionsProvider`.

## Time and recurrence (M4, `packages/core/src/time`)

See ADR 0010.

- `zone.ts`: `toZoned`/`fromZoned`/`zoneOffsetMinutes`/`startOfZonedDay` on cached
  `Intl.DateTimeFormat` (no `Temporal` in Node 22). Skipped March times move later; repeated
  November times take the first.
- `recurrence.ts`: RRULE subset (`FREQ=DAILY|WEEKLY`, `INTERVAL`, `BYDAY`, `UNTIL` as a local
  date, `COUNT`), `parseRRule`/`formatRRule`/`occurrenceDates`.
- `expand.ts`: `expandFixedEvents(events, from, to, { sleepFloorMin })` returns occurrences in
  each event's own zone, skipping exceptions; a sleep shorter than the floor in real time (the
  March night) is extended at the end (`extendedMin`). `availability(events, from, to)` = window
  minus every occurrence; `nightsWithoutSleep` lists dates with no sleep starting.
- `calendar/rules.ts`: `fixedEventProblem` (end ≠ start, sleep ≥ floor, UNTIL after the first
  day), `findBlockConflict` (nothing in sleep; focus blocks clear of fixed events and each other;
  background blocks overlap only meals, routine items and other blocks), `agendaNow` (current
  and next for Today).
- Main: `features/calendar/service.ts` (`CalendarService`: fixed events CRUD + skip, blocks CRUD
  with conflict checks, `range(from, to)` with colors, block conflicts and nights without sleep).
- Renderer: `features/calendar/` (Calendar page with FullCalendar 7 week/day, drag-to-select,
  task drop list, block/occurrence dialogs; Routine page at `/calendar/routine`), Today page
  `TodaySchedule` (now / next up; the current block's task becomes the big card's "Planned now").

## Scheduler (M5–M6, `packages/core/src/scheduler`)

- **Inputs:** availability, tasks (remaining estimate, due, earliest start, priority, chunking
  rules, attention type), existing blocks (for stability), locked blocks, now.
- **Algorithm v1:** discretize into 5-minute slots. Order work by least slack (time until due
  minus remaining work) with priority as a tie-break. Place chunks into the earliest suitable
  slots, respecting min/max chunk size, breaks and subject interleaving. Background tasks place
  their hands-on steps and let the waits overlap focus blocks.
- **Re-plan:** freeze the past and anything in progress, then re-place the rest from now. Prefer
  existing placements (stickiness) so the plan doesn't churn.
- **Output:** blocks with a human-readable `reason`, plus warnings when work can't fit before a
  deadline (with options: drop optional work, borrow from flexible time, etc.).
- **Tests:** property-based (fast-check). No overlaps except background waits, everything
  inside availability, deadlines met whenever feasible.

## Estimator (M7, `packages/core/src/estimator`)

- Groups history by task type (course + kind, e.g. "MATH 2413 homework"; for coach tasks,
  material kind + unit, e.g. "textbook pages", "problems").
- Learns the actual/estimate ratio and minutes per unit (problems, pages, words).
- Shrinks toward priors when data is thin, and plans with roughly the 70th percentile so
  blocks are realistic rather than optimistic.

## Claude bridge (M9, `apps/desktop/src/main/ai`)

Facts this design relies on were checked against the Claude Code docs on 2026-10-02 (see
"Verification results" in `docs/reviews/2026-10-02-fable-review.md`). Re-check them before M9.

- **Invocation:** spawn the user's installed CLI with the prompt on **stdin** (Windows command
  lines are capped at ~32 K characters; stdin is capped at 10 MB) and flags
  `-p --output-format json --json-schema <schema> --model <alias> --permission-mode dontAsk
  --permission-prompts none --max-turns <n> [--tools …] [--allowedTools …] [--resume <id>]`.
  **Never `--bare`**: bare mode never reads the subscription login (ADR 0003).
- **Subscription only:** the child process gets a copy of the environment with
  `ANTHROPIC_API_KEY` (and any other API-key/token variables) removed, because an API key in
  the environment takes precedence over the subscription login and would bill per token.
- **Flags live in a table** (`ai/cli-flags.ts`) with the minimum CLI version each one needs, so
  when `--bare` becomes the default for `-p` (announced in the docs) the fix is one entry, not a
  redesign. Settings shows "Claude Code v2.1.xxx found, logged in" (`claude --version`,
  `claude auth status`) and refuses to run jobs below the minimum version (2.1.259).
- **Windows:** resolve the real executable once, cache it, re-check on failure. On the
  owner's laptop it is the native `%USERPROFILE%\.local\bin\claude.exe` (M1 spike); an npm
  install would be `claude.cmd`, which only runs through `cmd.exe /d /s /c`. Pass arguments as
  one Windows-quoted string (see `scripts/claude-cli-spike.ps1`), never through a shell.
- **Working folder:** `<userData>/ai-work/<jobId>/`, empty except for job inputs. Because `-p`
  without `--bare` loads `~/.claude` settings, hooks and MCP servers, and any
  `CLAUDE.md`/`.mcp.json` in the folder, the folder never contains those. The M1 spike showed
  `--setting-sources user`, `--strict-mcp-config --mcp-config '{"mcpServers":{}}'` and
  `--safe-mode` all work with the subscription login and still return `structured_output`.
  `--safe-mode` also trimmed about 5 K tokens from every call, so jobs should use it unless a
  job needs a customization.
- **Per-call overhead:** each `-p` call carries roughly 20–26 K input tokens of system prompt
  and tool definitions before the job's own prompt (M1 spike). The 5-minute prompt cache is
  shared between back-to-back calls (about 15.7 K tokens read from cache), so related calls
  should run close together, and multi-stage jobs should resume one session.
  `total_cost_usd` is computed at list price (`costBasis: "list"`); on the plan it is only an
  estimate for the usage meter.
- **Model tiers** are aliases from Settings (`haiku` quick parsing, `sonnet` default and
  research gathering, `opus` synthesis and roadmap design). New model versions need no code
  change. If `opus` hits its own limit, synthesis falls back to `sonnet`. The M1 spike showed
  `--model opus` works on the owner's plan, and that with no `--model` the CLI picks Opus with
  the 1M context (`claude-opus-5[1m]` in `modelUsage`), so the runner always passes `--model`.
- **Structured intents, not free rein:** Claude returns JSON validated by zod schemas from core
  (`structured_output` field). The app applies them. Claude never edits the database.
- **Job queue:** priority phone > daily > deep work; one job at a time. Each job records
  `session_id`, `usage`, `total_cost_usd` (client-side estimate) for the usage meter.
  Limit detection lives in one regex table: the documented messages are "You've hit your
  session limit · resets 3:45pm", "… weekly limit · resets Mon 12:00am", "… Opus limit …" and
  "… Sonnet limit …"; `stream-json` also emits `system/api_retry` with `error: "rate_limit"`.
  A hit moves the job to `waiting_for_reset` with `resumeAfter` parsed from the message (else
  +60 min, doubling). Resume uses `--resume <sessionId>`. The exact `-p` JSON shape of a limit
  hit isn't documented; record it from a real run. A successful result (M1 spike) has
  `type: "result"`, `subtype: "success"`, `is_error: false`, `api_error_status: null`,
  `terminal_reason: "completed"`, `num_turns: 2` (structured output arrives through a tool
  call, so `stop_reason` is `"tool_use"`), `result` (the JSON as text), `structured_output`,
  `session_id`, `usage`, `modelUsage` keyed by model id, `total_cost_usd` and
  `permission_denials`. `api_error_status` is the first place to look for a limit hit.
- **Usage credits (owner decision Q3):** an account setting the owner turns on and caps at
  claude.ai; the app never turns them on. When a research run pauses at a limit, the job page
  offers "Wait for the reset" (default) or "Continue with usage credits", which shows how to
  enable credits with a cap and then resumes.
- **Long jobs** (research, roadmap, weekly report) are multi-stage: each stage is its own `-p`
  call that resumes the same session, so a limit between stages loses nothing. They hold
  `powerSaveBlocker`.
- **Cancel:** SIGINT first (ends the turn), SIGTERM after 10 s (exit 143, turn left unfinished).
- **Tests** use a fake `claude` executable (a Node script on PATH) that returns fixture JSON,
  including a usage-limit fixture. CI never needs a login.

## Coach pipeline (M11–M13, `features/coach` + `packages/core/src/coach`)

Each stage is an AiJob kind with its own zod output schema; the user approves between stages
(ADR 0006).

| Stage | Model | Tools | Output |
|---|---|---|---|
| 0 Intake | sonnet | none | GoalProfile (adaptive interview rendered as a form; optional diagnostic) |
| 1a Research: destination & levels | sonnet | WebSearch, WebFetch | levels[] with markers, exam facts, sources |
| 1b Research: curricula & sequencing | sonnet | WebSearch, WebFetch | topic graph, order, sources |
| 1c Research: materials | sonnet | WebSearch, WebFetch | Material[] with verified URLs, chosen on quality alone (price is never a factor) |
| 1d Research: practice & competitions | sonnet | WebSearch, WebFetch | projects ladder, problem sets, competitions with dates |
| 1e Research: time & pitfalls | sonnet | WebSearch, WebFetch | hours needed with sources, failure modes |
| 1 Synthesis | opus | none | dossier markdown + merged structured data |
| 2 Roadmap | opus | none | Phases/Milestones for the goal as stated, each with an impact note; dates and feasibility computed in core |
| 2b Impact check (also on demand) | sonnet | WebSearch, WebFetch | "does item X help goal Y?": how, strength, sources |
| 3 Course builder | opus | WebFetch (tables of contents) | Course + Units with materialRefs; gaps justified |
| 4 Decomposition | **core** | none | Tasks with quantities, estimates from estimator priors, due dates |

**Feasibility (core, deterministic):** hours needed (from the dossier) vs. hours available
(weekly hours × weeks to the deadline). When the work fits, roadmap dates are back-planned from
the deadline. When it doesn't, milestones are laid out forward from today at the available
weekly hours, so the plan still reaches the goal; the roadmap shows the shortfall, the projected
finish date next to the deadline, and what would close the gap. The goal itself is never
changed.

Rules enforced in code, not only in prompts: a Unit of kind `reading`/`project`/`assessment`
must have at least one `materialRef` or be `gap_lesson` with `gapReason`; a Material without
`verifiedAt` can't be referenced by a Unit; every Milestone has an `impact` note with at least
one source, and `weak` ones are shown as flagged; a roadmap whose hours exceed availability
always carries a visible feasibility warning.

## Phone relay (M14–M15, `apps/relay`)

- A Cloudflare Worker is the Telegram bot's webhook, set with a `secret_token` that Telegram
  sends back in the `X-Telegram-Bot-Api-Secret-Token` header. D1 holds an **outbox** (reminders
  with a send time) and an **inbox** (button taps, texts and photos, each with a server
  timestamp).
- A cron trigger runs every minute and sends due reminders, so they arrive while the laptop
  sleeps (free plan: cron allowed, 100,000 requests/day; D1: 100,000 rows written/day).
- The laptop polls the relay (no inbound ports). It pushes the next ~3 days of reminders
  whenever the plan changes, pulls inbox events, and applies them in timestamp order.
- **Buttons** (Start/Done/+15/Skip) and `add: …` messages are answered by the relay itself and
  cost zero tokens. Other **free text** waits for the laptop, which sends it to Claude. If the
  laptop is offline, the relay replies that it will handle the message when the laptop is back.
- **Security:** pairing code plus a chat-ID allowlist, and HMAC-signed laptop↔relay requests.
  The bot token lives in Worker secrets and Electron `safeStorage`.

## Testing strategy

| Layer | Tool | Where |
|---|---|---|
| Domain logic | Vitest (+ fast-check from M5) | `packages/core/src/**/*.test.ts` |
| Main-process services | Vitest with `electron` mocked; real SQLite (`:memory:` or temp files) | `apps/desktop/src/main/**/*.test.ts` |
| AI features | Vitest + fake `claude` executable | M9 |
| End-to-end smoke | Playwright `_electron` (`playwright-core`) on the built app, with a throwaway profile (`SCHOOL_ASSISTANT_DATA_DIR`) | `apps/desktop/e2e`, `pnpm e2e` |

`pnpm check` runs lint, typecheck and tests. CI runs it on Ubuntu and Windows, then builds and
runs the smoke test (under `xvfb-run` on Ubuntu).
