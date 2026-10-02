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
│                  (better-sqlite3)│           │                 M8
│                                  │ spawn     │
│                       `claude -p` (user's    │
│                        Claude Code, Pro plan)│  M7
└──────────────────────────────────────────────┘
```

- **Renderer**: React screens. It has no Node access and only talks to main through
  `window.api.invoke` (typed IPC).
- **Main process**: owns the database, the scheduler runs, the timer, the AI job queue, the
  relay sync, the tray and notifications.
- **`packages/core`**: pure TypeScript domain logic with no I/O: zod schemas, grade math, the
  scheduler, the estimator. It is used by main, the renderer and the relay. Most tests live here.
- **Relay** (M8): a tiny always-on mailbox, so the phone works while the laptop sleeps.

## Repository layout

```
packages/core/src/
  grades/        letter scales, course grade math (M1)
  scheduler/     time-blocking + re-planning (M4)
  estimator/     duration learning (M5)
  schemas/       shared zod schemas for domain objects
apps/desktop/
  electron.vite.config.ts  electron-builder.yml  resources/ (icons)
  src/main/      index.ts (window, tray, lifecycle), ipc.ts (validated dispatcher),
                 handlers.ts (channel implementations), security.ts (URL policy: links
                 open in the browser only for http/https/mailto, the window never navigates
                 off the app), features/<name>/ (services),
                 db/ (Drizzle schema + migrations, M1), ai/ (claude runner, M7)
  src/preload/   exposes window.api (contextIsolation + sandbox on)
  src/shared/    ipc.ts: the IPC contract, imported by main, preload and renderer
  src/renderer/src/
                 App.tsx (layout), routes.tsx (sidebar + pages), features/<name>/ (screens),
                 components/ (shared UI), lib/
apps/relay/      Cloudflare Worker (M8)
```

**Convention:** a feature lives in three places: domain logic in `packages/core/src/<feature>/`,
services and IPC handlers in `apps/desktop/src/main/features/<feature>/`, and screens in
`apps/desktop/src/renderer/src/features/<feature>/`. If logic can be pure, it goes in core.

## Typed IPC

`apps/desktop/src/shared/ipc.ts` declares every channel with zod `input`/`output` schemas.
`createIpcDispatcher` validates both directions, and `IpcHandlers` makes a missing handler a
compile error. Handlers receive the *parsed* input (`IpcParsedInput`, zod defaults applied),
while the renderer passes `IpcInput`. To add a call:

1. Add the channel to `ipcContract`.
2. Implement it in `src/main/handlers.ts` (or a feature module it delegates to).
3. Call `window.api.invoke('<channel>', input)` from the renderer. It is fully typed.

## Data model (target)

Built a little per milestone with Drizzle migrations. Times are stored as UTC ISO strings or
epoch ms, and durations in minutes.

| Entity | Key fields | Milestone |
|---|---|---|
| Course | name, code, term, kind (`enrolled`/`self_study`), grading (`weighted`/`points`), letterScale, goalId? | M1 |
| GradeCategory | courseId, name, weight, dropLowest | M1 |
| Assignment | courseId, categoryId, title, dueAt, pointsPossible, pointsEarned? | M1 |
| Task | title, description, courseId?, assignmentId?, parentId?, type, quantity+unit, estimateMin, dueAt?, earliestStart?, priority, splittable, minChunkMin, attention (`focus`/`light`/`background`), steps (background tasks), status | M2 |
| TimeSession | taskId, startAt, endAt?, source (`desktop`/`phone`/`manual`) | M2 |
| Completion | taskId, completedAt, summary | M2 |
| FixedEvent | title, kind (`class`/`sleep`/`meal`/`other`), recurrence rule, start/end | M3 |
| Block | taskId?, startAt, endAt, locked, planVersion, reason | M3–M4 |
| AiJob | kind, priority, model, sessionId, status (`queued`/`running`/`waiting_for_reset`/`done`/`failed`), input, output, usage, resumeAfter | M7 |
| RelayCursor / Reminder / PhoneEvent | sync state with the relay | M8 |
| Goal | title, why, deadline, kind, status | M10 |
| LearnerProfile | user-written "how to teach me" notes + Claude-maintained teaching guide, versioned | M10 |
| CoachNote | goalId?, text, source (`app`/`phone`/`feedback`) | M10 |
| Material | goalId, kind (pdf/link/note), path or url, title | M10 |
| ResearchDossier | goalId, markdown, citations, stage | M10 |
| Unit / Lesson / Assessment | courseId, order, content, kind (`homework`/`quiz`/`placement`/`exam`/`project`), dueAt, points, answerKey, rubric. Graded items also get an Assignment row. | M10–M11 |
| Report | kind (`weekly_research`/`weekly_review`), weekOf, markdown, data | M12 |

The database lives in `%APPDATA%/School Assistant/` (`app.getPath('userData')`) and is never
committed. M6 adds daily backup copies to a folder the user picks.

## Scheduler (M4, `packages/core/src/scheduler`)

- **Inputs:** availability (week minus fixed events, the 7.5 h sleep floor and meals), tasks
  (remaining estimate, due, earliest start, priority, chunking rules, attention type), existing
  blocks (for stability), locked blocks, now.
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

## Estimator (M5, `packages/core/src/estimator`)

- Groups history by task type (course + kind, e.g. "MATH 2413 homework").
- Learns the actual/estimate ratio and minutes per unit (problems, pages, words).
- Shrinks toward priors when data is thin, and plans with roughly the 70th percentile so
  blocks are realistic rather than optimistic.

## Claude bridge (M7, `apps/desktop/src/main/ai`)

- Spawns the user's installed CLI: `claude -p "<prompt>" --output-format json --json-schema
  '<schema>' --model <alias>`. It must **not** pass `--bare`, because bare mode ignores the
  subscription login and needs an API key.
- Model tiers come from config as aliases (`haiku` for quick parsing, `sonnet` by default,
  `opus` for deep research and course design), so new model versions need no code change.
- Runs in a dedicated working folder under the app's data directory, with only the tools the
  job needs (e.g. `WebSearch`/`WebFetch` for research, file writes inside that folder only)
  and `--permission-prompts none` for unattended runs.
- **Structured intents, not free rein:** for actions (e.g. a phone text), Claude returns JSON
  intents validated by zod schemas from core. The app applies them and re-plans. Claude never
  edits the database directly.
- **Job queue:** priority goes phone requests > daily jobs > deep work. A job that hits a usage
  limit becomes `waiting_for_reset` and resumes later with `--resume <sessionId>`. Usage per
  feature is logged for the usage meter.
- **Long research jobs** (M10, M12) are multi-stage and resumable across 5-hour usage windows,
  and they hold `powerSaveBlocker` so the laptop stays awake while they run.
- **Tests** use a fake `claude` executable that returns fixture JSON. CI never needs a login.

## Phone relay (M8, `apps/relay`)

- A Cloudflare Worker is the Telegram bot's webhook. D1 holds an **outbox** (reminders with a
  send time) and an **inbox** (button taps, texts and photos, each with a server timestamp).
- A cron trigger runs every minute and sends due reminders, so they arrive while the laptop
  sleeps.
- The laptop polls the relay (no inbound ports). It pushes the next ~3 days of reminders
  whenever the plan changes, pulls inbox events, and applies them in timestamp order.
- **Buttons** (Start/Done/+15/Skip) are answered by the relay itself and cost zero tokens.
  **Free text** waits for the laptop, which sends it to Claude. If the laptop is offline, the
  relay replies that it will handle the message when the laptop is back.
- **Security:** pairing code plus a chat-ID allowlist, and HMAC-signed laptop↔relay requests.
  The bot token lives in Worker secrets and Electron `safeStorage`.

## Testing strategy

| Layer | Tool | Where |
|---|---|---|
| Domain logic | Vitest (+ fast-check from M4) | `packages/core/src/**/*.test.ts` |
| Main-process services | Vitest with `electron` mocked | `apps/desktop/src/main/**/*.test.ts` |
| AI features | Vitest + fake `claude` executable | M7 |
| End-to-end smoke | Playwright `_electron` | to be added (M2–M3) |

`pnpm check` runs lint, typecheck and tests. CI runs it on Ubuntu and Windows.
