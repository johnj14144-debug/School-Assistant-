# Roadmap

This file is the source of truth for what gets built next. **Each milestone is sized for one
Claude Code session on a Pro plan** and leaves the app usable. Work top to bottom unless the
user says otherwise. When a milestone is done, tick its boxes, update [STATUS.md](STATUS.md),
and record any new decision in [`decisions/`](decisions/). If a session can't finish a
milestone, stop at a clean point and list exactly what's left in STATUS.

Legend: `[x]` done · `[ ]` to do. "AC" = acceptance criteria. The milestone isn't done until
they are all true.

---

## M0 — Foundation ✅

- [x] pnpm monorepo: `packages/core` (pure TS) + `apps/desktop` (Electron + React + Tailwind)
- [x] Typed, zod-validated IPC (`src/shared/ipc.ts`) with one working channel (`app:info`)
- [x] App shell: sidebar (Today, Calendar, Tasks, Grades, Coach, Reports, Settings), tray icon,
      hide-to-tray on close, single instance
- [x] Biome lint/format, TypeScript strict, Vitest; first core module (letter grades) tested
- [x] CI on Ubuntu + Windows; SessionStart hook for cloud sessions
- [x] Docs: VISION, ARCHITECTURE, ROADMAP, STATUS, IDEAS, ADRs, CLAUDE.md
- [x] Spike: better-sqlite3 loads in Node and Electron from prebuilt binaries (no compiler)
- [x] Fable review applied (`docs/reviews/2026-10-02-fable-review.md`): window URL policy
      (`security.ts`), IPC parsed-input type, installer config, CI timeout; spec, design and
      roadmap rewritten around the owner's answers (ADRs 0006–0007)

## M1 — Database, backups, log, grade math ✅

- [x] Drizzle + better-sqlite3 (≥ 13.0.2, which ships prebuilt binaries and has no install
      script) in main (`src/main/db/`): WAL, foreign keys, migrations on startup in a
      transaction, error screen if a migration fails; `Setting` table (ADR 0008)
- [x] Daily backup (`VACUUM INTO`) to a folder setting (default under Documents; folder picker
      in Settings), keep last 14 + first of month; "Back up now" button
- [x] `electron-log` → `app.getPath('logs')`; IPC handler errors logged
- [x] Core: course grade math for weighted-category and points-based courses, drop-lowest,
      extra credit; current %, **max possible %** (100% on everything ungraded), min possible %
- [x] Course / GradeCategory / Assignment tables and IPC channels (no screens yet beyond a
      debug list)
- [x] **Claude CLI spike (manual, owner's laptop):** the owner runs
      `scripts/claude-cli-spike.ps1` (copy-paste into PowerShell; it does the runs below with
      correct quoting) and pastes the output into a session. The runs:
      `echo "Return ok" | claude -p --output-format json --json-schema '{"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"]}'`
      while logged in, then the same with `--model opus`, `--setting-sources user`,
      `--strict-mcp-config` with no servers, and `--safe-mode`;
      record `claude --version`, `claude auth status`, whether `structured_output` came back,
      whether Opus works on the plan, and (if it ever happens) what a usage-limit result
      looks like, in STATUS gotchas

**AC:** the DB file appears in userData, a backup file appears in the backup folder, the log
file records startup; core grade math has unit tests covering weighted, points, drops, extra
credit and no grades yet; the CLI spike result is in STATUS.

## M2 — Courses & Grade Calc screens ✅

- [x] Courses CRUD (term, code, color, letter scale, grading type) and categories with weights
      (validate the weights sum to 100%)
- [x] Assignments CRUD with due date, points possible/earned; fast keyboard entry; bulk paste
      ("HW 1, 10/7, 20 pts" lines)
- [x] Grades page: overview card per course (current / max / min + letter) and a course detail
      table

**AC:** the user can enter a real UH course in under 5 minutes and see the correct current and
max grade.

## M3 — Tasks, timer & Today list

- [ ] Tasks: title, description, course/assignment link, type, quantity + unit (e.g. 12
      problems), estimate, due, priority, subtasks
- [ ] Quick add (Ctrl+K command palette), with natural shortcuts for due dates
- [ ] Timer: start / pause / resume / stop; one task running at a time (plus background tasks);
      multiple sessions per task; sessions survive restart
- [ ] **"I started at…" backfill** and editing of sessions; completion note on finish
- [ ] **Today list:** mark tasks "today", order by hand; Today page shows the list with a big
      Start/Stop; timer visible everywhere (header widget + tray menu)
- [ ] History view: per task and per type, estimate vs actual
- [ ] Playwright Electron smoke test (launch, navigate, start/stop a timer)

**AC:** the user can run their whole day through the Today list and timer; sessions survive an
app restart; backfill works; history shows estimate vs actual. **Start daily use here.**

## M4 — Calendar & routine

- [ ] Core `time/`: recurrence expansion with IANA zones (ADR 0007), availability windows;
      tests across the March and November DST changes
- [ ] FullCalendar week/day views in the renderer
- [ ] Fixed events with recurrence: UH class schedule, **7.5 h sleep floor**, meals, hygiene,
      custom; exceptions (cancelled class)
- [ ] Manual blocks: create, drag, resize, lock
- [ ] Today page shows the current block and next up alongside the Today list

**AC:** the week shows classes, sleep and meals correctly across a DST change; the user can
plan a day by hand and run it from the Today page.

## M5 — Scheduler v1: plan the week

- [ ] Core scheduler (see ARCHITECTURE.md): least-slack-first placement into free 5-min slots,
      chunking, breaks, subject interleaving; a "why here" reason on each block
- [ ] **Laundry-style background tasks**: hands-on steps scheduled, waits overlap focus work
- [ ] Infeasibility warnings with options
- [ ] "Plan my week" action; blocks appear on the calendar and the Today page
- [ ] Property-based tests with fast-check

**AC:** given a realistic week (5 courses, 25 tasks), it plans in under 1 s, never overlaps
focus blocks, never touches sleep, meets every feasible deadline.

## M6 — Scheduler v1: re-planning

- [ ] Re-plan from now on late start, overrun, early finish, task edits, manual trigger; past
      and in-progress work frozen; stickiness (minimal moves); locked blocks respected
- [ ] "Re-plan now" action; a diff of what moved
- [ ] Property tests for stability: a 30-minute late start moves only what it must

**AC:** a 30-minute late start moves only what it must; an overrun pushes later work without
touching sleep or locked blocks.

## M7 — Estimation engine

- [ ] Core estimator: per-type actual/estimate ratio, minutes per unit, shrinkage toward priors,
      ~P70 planning duration, confidence
- [ ] Scheduler uses estimator durations; the task form shows a suggested estimate
- [ ] Stats page: per course and type ("Calc HW: 1.4× your guess, ~7 min/problem")

**AC:** with seeded history, suggested estimates match the expected statistics in tests;
the scheduler uses them.

## M8 — Windows polish & reliability

- [ ] electron-builder NSIS installer (`pnpm --filter @sa/desktop dist`); app icon
- [ ] Start with Windows (setting); stays in tray
- [ ] Windows toast notifications at block start/end ("Calc HW starts now")
- [ ] Sleep/wake (`powerMonitor`) → re-plan; time zone change → redisplay
- [ ] Restore from backup (pick a file, relaunch); backup health shown in Settings
- [ ] Settings page for all of the above; log viewer ("Open log folder")

**AC:** fresh install on the laptop works; closing the lid overnight and reopening re-plans
correctly; a restore from yesterday's backup works.

## M9 — Claude bridge

- [ ] `ai/claude-runner.ts`: prompt via stdin; flags from `ai/cli-flags.ts` with minimum
      versions; `--json-schema` from zod; model aliases; dedicated empty working folder;
      restricted tools; `--max-turns`; timeouts; Windows executable resolution; child
      environment without `ANTHROPIC_API_KEY` so the subscription is always used
- [ ] Job queue in DB with priorities (phone > daily > deep work), usage-limit detection (one
      regex table) → `waiting_for_reset` → resume via `--resume`; retries; cancel (SIGINT then
      SIGTERM); a paused job offers "Wait for the reset" or "Continue with usage credits"
      (owner decision Q3)
- [ ] Usage meter page (usage per feature, recent jobs, failures, next reset time setting)
- [ ] Fake `claude` executable for tests (success, schema violation, usage limit, auth error);
      Settings: CLI path + version check ("Claude Code v… found, logged in")

**AC:** a job interrupted by a (faked) usage limit resumes later on its own; the runner refuses
to run below the minimum CLI version; all paths are tested with the fake CLI; a real
`app:ping-claude` round trip works on the laptop.

## M10 — Claude features I: task breakdown & syllabus import

- [ ] **Task breakdown**: a "Break it up" button plus automatic breakdown for big tasks; subtasks
      with quantities and estimates; applied only after the user accepts
- [ ] **Syllabus import**: PDF, photo or pasted text → course, categories/weights, assignments
      with due dates → review screen → save

**AC:** importing a real UH syllabus PDF produces a correct course after review; a 6-hour task
breaks into subtasks whose estimates sum to within 20% of the original.

## M11 — Coach I: learner profile, goal intake, research

- [ ] **"How I learn" page**: free-form advice; intake interview fills gaps; versioned
      **teaching guide** injected into coach prompts
- [ ] Goals: title, why, deadline, kind; coach notes (app, later phone); attach own materials
- [ ] **Goal intake interview** (stage 0): adaptive questions rendered as a form; weekly hours
      pulled from availability; optional diagnostic; produces GoalProfile
- [ ] **Deep research job** (stages 1a–1e + synthesis, resumable, `powerSaveBlocker`):
      levels with markers, curricula, materials with verified URLs chosen on quality alone
      (price never a factor), projects/competitions, hours needed with sources, pitfalls →
      dossier page with citations
- [ ] Approval button for the dossier

**AC:** for "Pass the UH Calculus 1 departmental exam" and "Become an expert programmer in a
year" (with fixture research output in tests, and one real run on the laptop), the app produces
an intake form and a cited dossier with at least three verified materials; nothing is
scheduled yet.

## M12 — Coach II: roadmap, feasibility & impact, textbook-first courses → planner

- [ ] **Roadmap** (stage 2): phases and milestones (course / project / competition /
      assessment / habit / reading) for the goal **as the user stated it**; "done when" per
      milestone; roadmap page with approve/edit
- [ ] **Feasibility** (core): hours needed vs. available; dates back-planned from the deadline
      when the work fits, laid out forward from today when it doesn't; a visible warning with
      the shortfall, projected finish date and what would close the gap; the goal is never
      lowered
- [ ] **Impact check** (stage 2b): every milestone says, with sources, how it helps the goal;
      weak ones flagged; a "Does this help my goal?" button for any item (e.g. a competition)
- [ ] **Course builder** (stage 3): units mapped to textbook chapters/sections and exercises;
      projects; gaps justified; grading scheme; approved courses appear in Grades as self-study
      courses
- [ ] **Decomposition** (stage 4, core): units/projects → tasks with quantities, estimates and
      due dates; scheduled by the planner after approval
- [ ] Code-enforced rules from ARCHITECTURE (materialRef or gap; verified materials only; a
      sourced impact note on every milestone; a feasibility warning whenever hours don't fit)

**AC:** an approved roadmap for the programming goal contains projects and at least one
competition, each with a sourced impact note; its first course references real chapters of a
verified textbook, contains no generated lesson for material the book covers, and turns into
scheduled tasks; a deliberately hard goal (fixture: a 4:30 mile within 6 months from a 7:00
mile) still gets a full plan plus a feasibility warning with a projected finish date.

## M13 — Coach III: assessments, gap lessons, feedback

- [ ] **Placement tests** at course start → skip or compress known units
- [ ] **Homework** per unit: due dates paced to the schedule, points, answer key and solutions
      revealed after submit; shows in Grades; becomes planner tasks
- [ ] **Practice exams**: timed, printable PDF, modeled on the real exam; scores per
      question/topic → grade + topic mastery
- [ ] **Gap lessons** (Markdown + KaTeX) only for `gap_lesson` units, following the teaching guide
- [ ] **Feedback loop**: rating + comment after each unit/assessment updates the teaching guide;
      upcoming units adapt to weak topics; mastery view per course/topic

**AC:** a full unit cycle works end to end: reading assignment → homework (due date in planner)
→ score entry → grade updated → feedback changes the next unit; a gap lesson is generated only
for a unit marked as a gap.

## M14 — Phone I: relay, reminders, quick capture

- [ ] `apps/relay` Cloudflare Worker: Telegram webhook with `secret_token`, D1 outbox/inbox,
      cron sender (every minute), HMAC auth for laptop calls; `wrangler` deploy instructions
- [ ] Pairing flow (code shown in app) + chat-ID allowlist
- [ ] Laptop sync service: push the next ~3 days of reminders on every plan change; pull inbox
      events; apply them in timestamp order
- [ ] Buttons: ▶ Start / ✅ Done / ⏰ +15 / ⏭ Skip, timestamped by the relay, answered instantly
- [ ] `add: …` messages become inbox tasks with zero tokens (owner decision Q5)
- [ ] Morning plan and evening review messages (templates, zero tokens); offline
      acknowledgement for other free text

**AC:** with the laptop asleep, a reminder arrives on time and tapping Start records the real
time once the laptop wakes; `add: buy calculator` appears as a task; nothing reaches the bot
from unpaired chats.

## M15 — Phone II: talk to it

- [ ] Free text → Claude returns zod-validated **intents** (add task, move, mark done,
      backfill, "I'm sick today, move everything", coach note) → app applies → re-plan →
      confirmation with diff
- [ ] Photo of a worksheet/assignment → tasks (with confirmation buttons)
- [ ] Clarifying questions when the intent is ambiguous

**AC:** ten representative messages (fixtures) map to the right intents; no message can change
data without passing schema validation.

## M16 — Weekly research report & review

- [ ] Scheduled job before the user's weekly usage reset (day/time setting)
- [ ] Research: upcoming competitions and deadlines from the roadmaps, new opportunities, ways
      to reach each goal; cited; new items come with an impact check
- [ ] Report page; Telegram summary plus the full report as a file
- [ ] Weekly review: planned vs done, deep-work hours, estimate accuracy, grades trend

**AC:** the report generates on schedule with citations and reaches the phone; the weekly
review numbers match the timer data.

## M17+ — Backlog

Pull from [IDEAS.md](IDEAS.md) with the user.
