# Roadmap

This file is the source of truth for what gets built next. Each milestone takes 1–2 sessions
and leaves the app usable. Work top to bottom unless the user says otherwise. When a milestone
is done, tick its boxes, update [STATUS.md](STATUS.md), and record any new decision in
[`decisions/`](decisions/).

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

## M1 — Courses & Grade Calc

- [ ] Drizzle + better-sqlite3 in main; DB file in userData; migrations run on startup
- [ ] Core: course grade math for weighted-category and points-based courses, drop-lowest,
      extra credit; current %, **max possible %** (100% on everything ungraded), min possible %
- [ ] Courses CRUD (term, code, color, letter scale, grading type) and categories with weights
      (validate the weights sum to 100%)
- [ ] Assignments CRUD with due date, points possible/earned; fast keyboard entry; bulk paste
      ("HW 1, 10/7, 20 pts" lines)
- [ ] Grades page: overview card per course (current / max / min + letter) and a course detail
      table

**AC:** the user can enter a real UH course in under 5 minutes and see the correct current and
max grade; core grade math has unit tests covering weighted, points, drops, extra credit, and
no grades yet.

## M2 — Tasks & Timer

- [ ] Tasks: title, description, course/assignment link, type, quantity + unit (e.g. 12
      problems), estimate, due, priority, subtasks
- [ ] Quick add (Ctrl+K command palette), with natural shortcuts for due dates
- [ ] Timer: start / pause / resume / stop; one task running at a time (plus background tasks);
      multiple sessions per task
- [ ] **"I started at…" backfill** and editing of sessions
- [ ] Completion note on finish (what was done plus a description)
- [ ] Timer visible everywhere (header widget + tray menu showing the running task)
- [ ] History view: per task and per type, estimate vs actual
- [ ] Playwright Electron smoke test (launch, navigate, start/stop a timer)

**AC:** the user can run their whole day through the timer; sessions survive an app restart;
backfill works; history shows estimate vs actual. **Start daily use here** so timing data
accumulates before the scheduler exists.

## M3 — Calendar & Routine

- [ ] FullCalendar week/day views in the renderer
- [ ] Fixed events with recurrence: UH class schedule, **7.5 h sleep floor**, meals, hygiene,
      custom
- [ ] Manual blocks: create, drag, resize, lock
- [ ] **Today** page: current block, big Start/Stop (wired to the timer), next up, day progress

**AC:** the week shows classes, sleep and meals correctly across a DST change; the user can
plan a day by hand and run it from the Today page.

## M4 — Scheduler v1 (auto time-blocking)

- [ ] Core scheduler (see ARCHITECTURE.md): least-slack-first placement into free 5-min slots,
      chunking, breaks, subject interleaving
- [ ] **Laundry-style background tasks**: hands-on steps scheduled, waits overlap focus work
- [ ] Re-plan from now on late start, overrun, early finish, task edits, manual trigger; past
      and in-progress work frozen; stickiness (minimal moves); locked blocks respected
- [ ] Infeasibility warnings with options; a "why here" reason on each block
- [ ] "Plan my week" and "Re-plan now" actions; a diff of what moved
- [ ] Property-based tests with fast-check

**AC:** given a realistic week (5 courses, 25 tasks), it plans in under 1 s, never overlaps
focus blocks, never touches sleep, meets every feasible deadline, and a 30-minute late start
moves only what it must.

## M5 — Estimation engine

- [ ] Core estimator: per-type actual/estimate ratio, minutes per unit, shrinkage toward priors,
      ~P70 planning duration, confidence
- [ ] Scheduler uses estimator durations; the task form shows a suggested estimate
- [ ] Stats page: per course and type ("Calc HW: 1.4× your guess, ~7 min/problem")

**AC:** with seeded history, suggested estimates match the expected statistics in tests;
the scheduler uses them.

## M6 — Windows polish & reliability

- [ ] electron-builder NSIS installer (`pnpm --filter @sa/desktop dist`); app icon
- [ ] Start with Windows (setting); stays in tray
- [ ] Windows toast notifications at block start/end ("Calc HW starts now")
- [ ] Sleep/wake (`powerMonitor`) → re-sync + re-plan; time zone change handling
- [ ] Daily DB backup to a user-chosen folder (keep last N); restore from backup
- [ ] Log file + crash reporting to a local file; Settings page for all of the above

**AC:** fresh install on the laptop works; closing the lid overnight and reopening re-plans
correctly; backups appear daily.

## M7 — Claude bridge

- [ ] `ai/claude-runner.ts`: spawn `claude -p` (no `--bare`), JSON schema outputs from zod,
      model alias tiers, dedicated working folder, restricted tools, timeouts
- [ ] Job queue in DB with priorities (phone > daily > deep work), usage-limit detection →
      `waiting_for_reset` → resume via `--resume`; retries
- [ ] Usage meter page (usage per feature, recent jobs, failures)
- [ ] Fake `claude` executable for tests; Settings: CLI path check ("Claude Code found, logged in")
- [ ] **Task breakdown**: a "Break it up" button plus automatic breakdown for big tasks; subtasks
      with estimates
- [ ] **Syllabus import**: PDF, photo or pasted text → course, categories/weights, assignments
      with due dates → review screen → save

**AC:** importing a real UH syllabus PDF produces a correct course after review; a job
interrupted by a usage limit resumes later on its own; all AI paths are tested with the fake CLI.

## M8 — Phone: relay + reminders

- [ ] `apps/relay` Cloudflare Worker: Telegram webhook, D1 outbox/inbox, cron sender (every
      minute), HMAC auth for laptop calls; `wrangler` deploy instructions
- [ ] Pairing flow (code shown in app) + chat-ID allowlist
- [ ] Laptop sync service: push the next ~3 days of reminders on every plan change; pull inbox
      events; apply them in timestamp order
- [ ] Buttons: ▶ Start / ✅ Done / ⏰ +15 / ⏭ Skip, timestamped by the relay, answered instantly
- [ ] Morning plan and evening review messages (templates, zero tokens)
- [ ] Offline acknowledgement for free text

**AC:** with the laptop asleep, a reminder arrives on time and tapping Start records the real
time once the laptop wakes; nothing reaches the bot from unpaired chats.

## M9 — Phone: talk to it

- [ ] Free text → Claude returns zod-validated **intents** (add task, move, mark done,
      backfill, "I'm sick today", coach note) → app applies → re-plan → confirmation with diff
- [ ] Photo of a worksheet/assignment → tasks (with confirmation buttons)
- [ ] Clarifying questions when the intent is ambiguous

**AC:** ten representative messages (fixtures) map to the right intents; no message can change
data without passing schema validation.

## M10 — Coach I: Learner profile, goal research, course builder

- [ ] **"How I learn" page**: free-form advice from the user; an intake interview fills gaps;
      Claude keeps a concise, versioned **teaching guide** injected into every coach prompt
- [ ] Coach notes any time (app, or Telegram "coach: …"); attach own materials per goal
- [ ] Goals: title, why, deadline, current level, weekly hours
- [ ] **Deep research job** (multi-stage, Opus, web tools, resumable across usage windows,
      keeps the laptop awake): a cited dossier of what mastery requires, exam format/topics,
      best free texts, canonical curricula, gaps for this user
- [ ] **Course design**: one or more full college-style courses per goal: objectives, units,
      week-by-week schedule back-planned from the deadline, readings, lectures, homework,
      exams/projects, grading scheme
- [ ] Review/edit/approve UI; approved courses appear in Grades (self-study) and feed tasks
      into the planner

**AC:** for "Pass the UH Calculus 1 departmental exam" and "Become an expert programmer in a
year", the app produces a cited dossier and a complete course outline that follows the
teaching guide; the outline turns into scheduled work.

## M11 — Coach II: Content, homework & assessments

- [ ] Rolling generation of lecture notes 1–2 units ahead (Markdown + KaTeX), following the
      teaching guide
- [ ] **Homework** per lesson/unit: due dates paced to the schedule, points, answer key and
      solutions revealed after submit; shows in Grades; becomes planner tasks
- [ ] **Placement tests** at course start → skip or compress known units
- [ ] **Practice exams**: timed, printable PDF, modeled on the real exam; the user enters
      scores per question/topic → grade + topic mastery
- [ ] **Feedback loop**: rating + comment after each lesson/homework updates the teaching guide;
      upcoming units/homework adapt to weak topics
- [ ] Mastery view per course/topic

**AC:** a full unit cycle works end to end: lesson → homework (due date in planner) → score
entry → grade updated → feedback changes the next unit.

## M12 — Sunday deep-research report & weekly review

- [ ] Scheduled job before the user's weekly usage reset (configurable day/time)
- [ ] Research: competitions to join, things to do, ways to reach each goal; cited
- [ ] Report page; Telegram summary plus the full report as a file
- [ ] Weekly review: planned vs done, deep-work hours, estimate accuracy, grades trend

**AC:** the report generates on schedule with citations and reaches the phone; the weekly
review numbers match the timer data.

## M13+ — Backlog

Pull from [IDEAS.md](IDEAS.md) with the user.
