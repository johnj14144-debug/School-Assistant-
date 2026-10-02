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
  `window.api.invoke` (typed IPC). It never navigates away from the app and can only open
  `http(s)`/`mailto` links in the system browser (`src/main/security.ts`). In-app routes are
  hash routes.
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
  grades/        letter scales, course grade math (M1)
  retention/     which dated backups and logs to keep (M1)
  time/          recurrence expansion with time zones, availability windows (M4)
  scheduler/     time-blocking + re-planning (M5–M6)
  estimator/     duration learning (M7)
  coach/         feasibility math, roadmap date planning, decomposition to tasks (M11–M12)
  schemas/       shared zod schemas for domain objects and for Claude's structured outputs
apps/desktop/
  electron.vite.config.ts  electron-builder.yml  resources/ (icons)
  src/main/      index.ts (window, tray, lifecycle), security.ts (URL policy), ipc.ts
                 (validated dispatcher), handlers.ts (composes per-feature handler objects),
                 runtime.ts (opens the DB, builds services), log.ts,
                 db/ (schema, migrations/, migrate, database, settings, backup),
                 features/<name>/ (services + that feature's IPC handlers),
                 ai/ (claude runner + job queue, M9), test/ (test helpers)
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
Feature handler objects are typed `HandlersFor<'prefix'>` (every channel starting with that
prefix). If the database fails to open, only the `app:*` channels work and the renderer shows
an error screen (`app:status`).

## Storage, backups and logging (M1)

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
| GradeCategory | courseId, name, weight (percent), dropLowest, position | M1 |
| Assignment | courseId, categoryId? (set null if the category is deleted), title, dueAt?, pointsPossible, pointsEarned?, extraCredit, createdAt, updatedAt; unitId? added in M12 | M1 |
| Task | title, description, courseId?, assignmentId?, unitId?, parentId?, type, quantity+unit, estimateMin, dueAt?, earliestStart?, priority, splittable, minChunkMin, attention (`focus`/`light`/`background`), steps, today (bool + order), status | M3 |
| TimeSession | taskId, startAt, endAt?, source (`desktop`/`phone`/`manual`) | M3 |
| Completion | taskId, completedAt, summary | M3 |
| FixedEvent | title, kind (`class`/`sleep`/`meal`/`hygiene`/`other`), startLocal, endLocal, rrule, timeZone, exceptions | M4 |
| Block | taskId?, startAt, endAt, locked, planVersion, reason | M4–M6 |
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
- Warnings: weights not summing to 100 (weights are renormalized), uncategorized assignments in
  a weighted course (ignored). Results are rounded at 1e-10 so float noise can't cost a letter.

## Time and recurrence (M4, `packages/core/src/time`)

- `expandFixedEvents(events, fromUtc, toUtc)` returns UTC intervals for the window, honoring each
  event's `timeZone` and DST. Tests cover the March and November transitions.
- `availability(window, fixedEvents, sleepFloorMin)` returns the free intervals the scheduler may
  use, never shorter than the sleep floor across any night.

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
- **Windows:** resolve the real executable (`where claude` → `claude.cmd` → run through
  `cmd /c`, or the native `claude.exe` if installed) once, cache it, re-check on failure.
- **Working folder:** `<userData>/ai-work/<jobId>/`, empty except for job inputs. Because `-p`
  without `--bare` loads `~/.claude` settings, hooks and MCP servers, and any
  `CLAUDE.md`/`.mcp.json` in the folder, the folder never contains those. To keep the user's
  own hooks and MCP servers out too, test in the M1 spike: `--setting-sources` (limits which
  settings files load), `--strict-mcp-config` with an empty config, and `--safe-mode`
  (customizations off, login unaffected per the docs).
- **Model tiers** are aliases from Settings (`haiku` quick parsing, `sonnet` default and
  research gathering, `opus` synthesis and roadmap design). New model versions need no code
  change. If `opus` isn't available on the plan or hits its own limit, synthesis falls back to
  `sonnet`.
- **Structured intents, not free rein:** Claude returns JSON validated by zod schemas from core
  (`structured_output` field). The app applies them. Claude never edits the database.
- **Job queue:** priority phone > daily > deep work; one job at a time. Each job records
  `session_id`, `usage`, `total_cost_usd` (client-side estimate) for the usage meter.
  Limit detection lives in one regex table: the documented messages are "You've hit your
  session limit · resets 3:45pm", "… weekly limit · resets Mon 12:00am", "… Opus limit …" and
  "… Sonnet limit …"; `stream-json` also emits `system/api_retry` with `error: "rate_limit"`.
  A hit moves the job to `waiting_for_reset` with `resumeAfter` parsed from the message (else
  +60 min, doubling). Resume uses `--resume <sessionId>`. The exact `-p` JSON shape of a limit
  hit isn't documented; record it from a real run.
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
| End-to-end smoke | Playwright `_electron` | M3 |

`pnpm check` runs lint, typecheck and tests. CI runs it on Ubuntu and Windows.
