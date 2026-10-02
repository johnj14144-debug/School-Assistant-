# Fable review: School Assistant

_Review of commit `0521084` (2026-10-02). Budget for this review: $20. The reviewer had a sandbox
with the real repo: `pnpm check` and `pnpm build` were run before and after every code change
below, so the code in section 5 is known to lint, typecheck, test and build._

## 1. Summary for the owner

What's good: the foundation is clean and small. Typed IPC, strict TypeScript, tests, CI on
Windows, and docs written for future AI sessions. That's rare for a day-one project and it's the
right shape for something you'll run for years.

What matters most to fix:
1. **The Life Coach spec doesn't say what you actually want.** Today it says "write full courses
   with lectures". You want: ask where I'm starting from → research what it really takes → tell
   me honestly what's reachable → build a roadmap of textbooks, projects and competitions → break
   it down until it's tasks on my calendar, and don't write lessons where a textbook already
   does the job. This review rewrites the spec, the design and the data model around that.
2. **The roadmap is in the wrong order and the steps are too big.** The coach (your centerpiece)
   and the Claude connection (the riskiest piece) are last, and several milestones are 2–4
   sessions of work. The roadmap is re-cut into one-session steps, with a cheap early check that
   the Claude connection works on your laptop.
3. **Your data isn't protected until M6, but you start using the app at M2.** Backups and a log
   file move to the first milestone.
4. Smaller fixes: the app window could be tricked into opening non-web links or navigating
   away; recurring events (classes, sleep) must be stored in local time, not UTC, or they break
   at daylight-saving changes; a few docs contradict each other.

What changes for you: you'll answer 6 multiple-choice questions, then the next session applies
everything. After that, "continue the roadmap" builds M1.

## 2. Findings

### F1 — The Life Coach spec, design and roadmap don't match the owner's intent (high)
**What:** `VISION.md` describes the coach as a course *author*: "builds full college-style
courses", "lectures and readings", and M11 schedules "rolling generation of lecture notes". The
owner's actual requirement is a *research-and-decomposition engine*: start from where the user
is, research deeply what the goal really takes, be extremely realistic, build a roadmap of
learning + projects + competitions, use textbooks for teaching and only generate content for
gaps, and break everything down into smaller and smaller pieces until it's planner tasks.
**Why it matters:** this is the feature the owner cares about most and the one that will consume
most Claude usage. Built as currently specified it would burn the Pro plan writing lecture notes
that OpenStax or Stroustrup already wrote better, and it would never tell the owner "a year is
not enough for *expert*, here is what a year buys you".
**Recommendation:** rewrite the Coach section of VISION, add a "Coach pipeline" section and new
entities to ARCHITECTURE, restructure the coach milestones, and record the principle in an ADR
(textbook-first, roadmap-driven, honest). See C2–C5.
**Confidence:** high (the owner stated the requirement directly).

### F2 — Roadmap order: the centerpiece and the biggest risk are last (high)
**What:** The Claude bridge is M7 and the coach is M10–M11. Nothing about the AI path is
verified until M7 except reading the docs. The owner's own goals have a one-year horizon.
**Why:** if `claude -p` behaves differently on the laptop than the docs say (auth, flags,
Windows quirks), everything from M7 onward is affected and it's discovered months in.
**Recommendation:** (a) add a 15-minute manual spike to M1: run `claude -p … --output-format
json --json-schema …` on the laptop while logged in, record the CLI version and result in
STATUS; (b) move the coach ahead of the phone (owner decision Q1); (c) keep the planner core
first because it's what makes the app daily-use.
**Confidence:** high.

### F3 — Milestones are too big for one Claude Code session on a Pro plan (high)
**What:** ROADMAP says "each milestone takes 1–2 sessions"; the owner's rule is one session.
M1 (DB + grade math + 3 CRUD screens), M4 (scheduler + re-plan + UI + property tests), M7
(runner + queue + usage meter + fake CLI + task breakdown + syllabus import) and M10 (profile +
intake + research + course builder + approval UI) are each 2–4 sessions.
**Why:** a milestone that doesn't finish leaves the app half-usable and STATUS vague; the next
session loses time reconstructing state.
**Recommendation:** re-cut into one-session milestones (C5) and add a "stop at a clean point"
rule to CLAUDE.md (C7).
**Confidence:** high.

### F4 — Data safety and logging arrive too late (high)
**What:** daily use starts at M2 (timer), backups and a log file arrive at M6.
**Why:** a laptop that sleeps, travels and gets Windows updates will lose a database at some
point. Timer history is the asset that makes the estimator work; losing months of it is the
kind of event that makes someone stop using an app. Without a log file, future sessions can't
diagnose anything that happened while the owner wasn't looking.
**Recommendation:** M1 ships the database *with* WAL mode, a daily backup (`VACUUM INTO` to a
folder the owner picks, keep the last 14 + one per month), and `electron-log` writing to
`app.getPath('logs')`. Restore-from-backup UI can wait for the polish milestone. See C5.
**Confidence:** high.

### F5 — Claude bridge design needs hardening against known CLI facts (high)
**What (verified in the official headless docs on 2026-10-02):**
- `--bare` "will become the default for `-p` in a future release", and bare mode "never reads
  OAuth credentials". When that flips, every job fails with an auth error.
- Without `--bare`, `-p` loads `~/.claude` settings, hooks, MCP servers and any `CLAUDE.md` in
  the working directory, "even in a folder you've never trusted".
- `--permission-prompts none` needs v2.1.259+; `--json-schema` validation errors only since
  v2.1.205; unreadable stdin on Windows crashed before v2.1.211.
- Piped stdin is capped at 10 MB; Windows command lines are capped at ~32 K characters, so
  prompts (dossiers, syllabi) must go through stdin, not argv.
- On Windows the npm install exposes `claude.cmd`, which `child_process.spawn` can't run
  without `shell: true` (or resolving the real executable).
- JSON output includes `is_error`, `session_id`, `usage`, `total_cost_usd`; `stream-json`
  emits `system/api_retry` with `error: "rate_limit"`.
- `--resume <id>` works from any directory since v2.1.223; SIGTERM leaves the turn unfinished
  (exit 143).
**Recommendation:** the runner sends prompts via stdin, checks `claude --version` against a
minimum (2.1.259), keeps its flag list in a config table so a doc-only change can add
`--no-bare` (or whatever the flip requires), runs in a dedicated empty working folder, passes
`--max-turns`, and detects limits from `is_error` + the result text and `api_retry` events.
Written into ARCHITECTURE (C4) and the M9 checklist (C5). Verification items D1–D4.
**Confidence:** high on the facts, medium on the exact limit-detection mechanism (D3).

### F6 — "Spend a lot of tokens" research vs. a Pro plan (medium)
**What:** VISION says research "should spend a lot of tokens". Pro has a 5-hour window and a
weekly cap shared with the owner's own chat use; Opus consumes the cap several times faster
than Sonnet; the weekly reset is at a fixed time assigned to the account (not Sunday night).
Anthropic's legal page says Pro/Max limits "assume ordinary, individual usage".
**Why:** one unbounded Opus research job could wipe out a week's budget, and the Sunday report
is scheduled against a reset time that must be entered by the owner.
**Recommendation:** staged research with Sonnet for gathering and Opus only for synthesis
(configurable); an estimate of windows/turns shown before launch; `--max-turns` per stage;
research results cached and reused; the weekly reset time is a setting. Usage credits (the
subscription's pay-as-you-go top-up) are the only acceptable overflow, and only if the owner
chooses it (Q3). Never API keys (CLAUDE.md rule stands).
**Confidence:** high.

### F7 — "Everything in UTC" is wrong for recurring fixed events (medium)
**What:** VISION and CLAUDE.md say times are stored in UTC. Classes, the sleep floor and meals
are *local wall-clock recurrences* ("MWF 10:00–11:00 America/Chicago"). Stored as UTC they
shift by an hour at every DST change, which the M3 acceptance criterion explicitly tests.
**Recommendation:** instants (timer sessions, completions, block start/end) stay UTC;
recurring fixed events store local time + an IANA zone, anchored to Houston by default even
when the laptop travels (Q6). ADR 0007 (C3), wording fixed in VISION/ARCHITECTURE/CLAUDE.md.
**Confidence:** high.

### F8 — Electron hardening gaps in M0 code (medium)
**What:** `setWindowOpenHandler` passes *any* URL to `shell.openExternal` (including `file:`
and custom schemes); there is no `will-navigate` guard; no permission-request handler; the
default menu (DevTools, reload) is active in the packaged app.
**Why:** cheap to fix now, hard to remember later once Markdown from Claude (links!) is
rendered in the renderer.
**Recommendation:** C8 adds `security.ts` (pure, tested) and wires it into `index.ts`.
**Confidence:** high.

### F9 — IPC handler input type is slightly wrong (medium, small)
**What:** `Handler<C>` receives `z.input<…>` but the dispatcher passes the *parsed* value
(`z.output`). The moment a channel schema uses `.default()` or `.transform()`, handlers get the
wrong type and the `as never` cast hides it.
**Recommendation:** add `IpcParsedInput` and use it in `Handler` (C9).
**Confidence:** high.

### F10 — Docs contradict each other in small ways (medium)
- CLAUDE.md: "add a handler in `src/main/handlers.ts`"; ARCHITECTURE: "services and IPC handlers
  in `apps/desktop/src/main/features/<feature>/`". Fix: `handlers.ts` composes per-feature
  handler objects.
- ROADMAP "1–2 sessions" vs. one session.
- `tsconfig.web.json` includes `src/preload/index.d.ts`, which doesn't exist.
- `docs/prompts/README.md` says "your $13"; the review budget is $20.
- CLAUDE.md says the relay "arrives in M8"; it moves with the roadmap.
- CLAUDE.md has no instruction for running out of time mid-milestone (apply-review.md has one).
Fixed in C1, C4, C5, C7, C10.

### F11 — Daily use has no hook until M3/M4 (medium)
**What:** the plan says "start daily use at M2", but M2 gives a task list and timer without any
notion of *today*. The Today page only becomes useful with the calendar (M3) and scheduler (M4).
**Why:** the estimator needs weeks of timer data; every week of delay costs data, and a tool
that doesn't shape the day is easy to abandon.
**Recommendation:** the tasks/timer milestone includes a minimal Today list (tasks marked "do
today", ordered by hand, big Start/Stop). The scheduler later fills the same page. Also a
"sick day / travel" mode in the re-plan milestone, because the first time the owner is ill and
the app keeps nagging is a quitting moment. See C5.
**Confidence:** medium.

### F12 — Installer config will try to compile better-sqlite3 (low)
**What:** electron-builder rebuilds native modules by default; better-sqlite3 13.0.3 depends on
`node-addon-api` and ships N-API prebuilt binaries, so a rebuild is unnecessary and fails on a
laptop without Visual Studio Build Tools. Also no `publish: null`, so a stray `GH_TOKEN` in the
environment would make `dist` try to upload a release.
**Recommendation:** C11 (`npmRebuild: false`, `asarUnpack: "**/*.node"`, `publish: null`).
Verify D7 when the dependency lands.
**Confidence:** medium-high.

### F13 — CI has no job timeout (low)
A hung Electron download or test would run for GitHub's 6-hour default. C12 adds
`timeout-minutes: 20`.

## 3. Decisions for the owner

### Q1 — In what order should the big pieces be built?
- **(Recommended) Planner core → Claude bridge → Life Coach → Phone.** You get a working
  daily planner first, then the coach (your centerpiece), then the phone.
- Planner core → Claude bridge → Phone → Life Coach. Phone reminders earlier, coach later.
- Keep the original order (coach last).
_What changes:_ the numbering of milestones M9–M16 in C5 (the apply session swaps the two
blocks if you pick option 2; C5 is written for option 1).

### Q2 — Where should daily backups go from day one?
- **(Recommended) A folder I pick in Settings (e.g. OneDrive), with a sensible default inside
  my Documents folder until I pick one.**
- Only inside the app's data folder for now; OneDrive later.
_What changes:_ whether M1 includes a folder picker (one small dialog) or just a default path.

### Q3 — How hard may the coach's research lean on your Claude plan?
- **(Recommended) Staged: Sonnet gathers, Opus writes the final dossier/roadmap. The app shows
  an estimate before each research run, and never buys extra usage.**
- Same, but allow me to turn on Anthropic "usage credits" (pay-as-you-go on my subscription)
  for one-off deep research when I say so.
- Opus for everything; I accept hitting limits more often.
_What changes:_ the default model tiers in the M9/M11 checklists and whether a "use credits"
switch exists in Settings. (API keys are never an option.)

### Q4 — Which textbooks may the coach recommend?
- **(Recommended) Free/open texts first; well-known paid books allowed when clearly better,
  shown with price and a free alternative, and I approve before they're in the plan.**
- Free only.
- Anything, no approval step.
_What changes:_ a rule in VISION and the research prompt in M11.

### Q5 — Should the phone be able to add a task without using Claude?
- **(Recommended) Yes: a message starting with `add:` becomes an inbox task instantly, zero
  tokens. Everything else waits for the Claude-powered milestone.**
- No, keep the phone to buttons until the "talk to it" milestone.
_What changes:_ one checklist line in the relay milestone.

### Q6 — When you travel, should classes/sleep stay on Houston time?
- **(Recommended) Fixed events keep their own time zone (Houston by default). The calendar
  shows them in the laptop's current zone.**
- Everything follows the laptop's current zone.
_What changes:_ ADR 0007 wording (C3) and the FixedEvent schema in M4.

## 4. Pitches

- **P1 — Reality-check card on every goal.** "At 25 h/week until 2027-10-01 you can reach
  *level 3 of 5 (job-ready)*; *expert* lands around 2029." Sources shown. Size S (on top of the
  research dossier). Fits Coach I (M11). _Part of the centerpiece; included in C2/C4/C5._
- **P2 — Textbook progress bars.** Pages/chapters done per book, visible on the goal page and
  in Grade Calc for self-study courses. Size S. Coach II (M12).
- **P3 — Evidence locker.** Attach finished projects, competition results and exam scores to
  roadmap milestones; the goal page becomes a portfolio. Size S. Coach II/III.
- **P4 — Roadmap checkpoint.** Monthly (or when a milestone slips >2 weeks) the coach compares
  progress to plan and *proposes* changes; nothing moves without approval. Size M. Weekly
  report milestone (M16).
- **P5 — "Does this fit?" dry run.** Before accepting a new course or roadmap, the scheduler
  shows whether the week still fits and what gives. Size M. After scheduler (M6+).
- **P6 — Usage forecast before a research run.** Estimated turns, which 5-hour windows it will
  span, and what else is queued. Size S. Claude bridge (M9).
- **P7 — Markdown export of everything** (Obsidian-compatible folder) as a second, human-readable
  backup. Size S. Polish milestone (M8).
- **P8 — Sick-day / travel mode.** One tap: today's plan collapses to essentials, nothing nags,
  tomorrow re-plans. Size S. Re-plan milestone (M6). _Included in C5 as a checklist item._
- **P9 — Hours-by-goal weekly view.** Where the week's hours actually went, per course/goal.
  Size S. After estimator (M7).

## 5. Change list

Apply in order. C8–C12 were applied in the reviewer's sandbox; `pnpm check` and `pnpm build`
pass with them.

### C1: Fix the budget figure in the prompts README
- Why: F10 (owner correction: the budget is $20)
- Needs owner decision: none
- Verify: `grep -n '\$' docs/prompts/README.md` shows only `$20`.

#### Edit `docs/prompts/README.md`
Find:
~~~text
**Optional second pass.** This uses more of your $13 and catches Fable's own mistakes. When
Fable is done, send:
~~~
Replace with:
~~~text
**Optional second pass.** This uses more of your $20 and catches Fable's own mistakes. When
Fable is done, send:
~~~

### C2: Rewrite the product spec around the real Life Coach
- Why: F1, F6, F7, F11, P1, P8
- Needs owner decision: Q3, Q4, Q6 (the text below assumes the recommended options; adjust the
  marked sentences otherwise)
- Verify: VISION reads as a spec a stranger could build from; no mention of "lectures" as the
  default teaching mode.

#### Write `docs/VISION.md`
~~~md
# Vision

School Assistant is a personal app for one student: a University of Houston student who
treats school like a monastery. It runs on their Windows laptop, talks to their iPhone through
Telegram, and uses their Claude Pro plan for everything that needs judgment. It's meant to be
used every day for years, so it has to be reliable, fast, and easy to extend.

It has three parts: the **Planner**, the **Life Coach**, and **Grade Calc**.

This document is the product spec. It records what the user asked for and what was decided in
the first brainstorm (2026-10-02) and the first review (2026-10-02). When a request conflicts
with this document, ask the user.

---

## The user and their constraints

| | |
|---|---|
| Computer | Windows **laptop** that sleeps and travels (not always on) |
| Phone | iPhone, using a **Telegram** bot (free, two-way, buttons, photos) |
| Claude | **Pro** plan. The user barely uses Claude otherwise, so the app may use nearly all of it. Limits: a rolling 5-hour window plus a weekly cap, shared with the user's own chats. |
| School | University of Houston. Canvas can't be connected, so the user enters everything by hand. Syllabus import cuts the typing. |
| Sleep floor | **7.5 hours** a night, protected no matter what |
| Mode | "Student monk": everything outside sleep, meals and hygiene is available for school and goals, 7 days a week |
| Goals | Ace the Precalculus → Calculus 2 departmental exams; become an expert programmer within a year; more to come |
| Honesty | The user wants the truth about what a goal takes, even when the answer is "not by that date" |
| Codebase | Built for the app, not as a learning project. Choose what is best for the app. |

---

## Planner

**Job:** time-block the whole week from deadlines, and keep the plan honest all day.

- Looks at the week's deadlines and **time-blocks the whole week** around fixed events (classes,
  sleep floor, meals).
- **Task timer:** start/stop every task. Each completed task records what it was plus a
  description. Assignments go inside tasks so the history is detailed. Supports pause, multiple
  sessions per task, and **"I started at…" backfill** if the user forgot to press start.
- **Today list before the scheduler exists:** from the first day of use, the user can mark
  tasks "today", order them by hand, and run them from the Today page. The scheduler later
  fills the same page automatically.
- **Learns durations** from timer history ("Calc HW: you take 1.4× your guess, ~7 min/problem")
  and uses them to size future blocks.
- **Re-plans live** when the user starts late, runs over, or finishes early.
- **Sick day / travel mode:** one action collapses today to essentials, silences reminders, and
  re-plans tomorrow.
- **Calendar** showing everything.
- **Breaks big tasks into smaller pieces**, but only when it helps. Not every task.
- **Concurrent tasks** ("laundry-style"): a task with waiting time is modeled as hands-on steps
  plus waits. The waits overlap focused work.
- **Syllabus import:** give it a syllabus PDF, a photo, or pasted text. Claude extracts the
  course, grade weights, assignments and due dates. The user reviews before anything is saved.
- **Phone:** reminders arrive on the iPhone even while the laptop sleeps. Buttons (▶ Start,
  ✅ Done, ⏰ +15, ⏭ Skip) work offline and keep their real timestamps. A message starting with
  `add:` becomes a task instantly without Claude. The user can text it in plain English ("move
  the essay to tomorrow, I'm sick") to add things or change the day.
- **Daily rhythm:** morning plan message, evening review, weekly review.

**Design rule: the algorithm plans and Claude advises.** Scheduling and re-planning are
deterministic code: instant, free, predictable, testable. Claude handles the fuzzy parts:
understanding texts, breaking work down, reading syllabi, researching goals, designing
roadmaps and courses.

**Time rule:** moments (timer sessions, block times, due dates) are stored in UTC. Recurring
fixed events (classes, sleep floor, meals) are stored as local wall-clock time plus a time zone,
Houston by default, so they stay put across daylight-saving changes and travel. Everything is
shown in the laptop's current time zone.

---

## Life Coach

**Job:** take a big goal, find out what it really takes, say honestly what's reachable, and
break it down into smaller and smaller pieces until it's work on the calendar.

The coach is a **research-and-decomposition engine**, not a textbook author. It works in this
order for every goal, and the user approves each step before the next one runs:

1. **Where are you starting from?** An intake interview per goal: what the goal is and why, the
   deadline, hours per week (taken from the planner's real availability), current level with
   evidence ("what have you built / solved / read; what can you do right now"), materials the
   user already owns, constraints (money for books, hardware), and how the user likes to learn.
   Where self-assessment isn't enough, a short diagnostic (a placement quiz or a 30-minute
   exercise) sharpens the picture. Nothing else runs until this is done.

2. **Deep research.** Multi-stage, resumable across usage windows, cited. It establishes:
   - what the destination means in observable terms (for an exam: format, topics, pass mark,
     registration rules; for a skill: a ladder of levels from novice to expert, each with
     markers you can check);
   - the canonical curricula and the order people actually learn things in;
   - the best **textbooks and materials** per topic, each with a verified link, cost, and a
     free alternative where one exists (free/open texts first; a paid classic may be
     recommended when it is clearly better, and the user approves it before it enters the plan);
   - **projects** worth building, graded by difficulty; problem sets; **competitions** worth
     entering, with eligibility, dates and links;
   - how many hours people realistically need to reach each level, with sources;
   - common ways people fail at this goal.
   The output is a research dossier the user can read, with a structured part the app uses.

3. **Reality check.** Hours needed per level (from the dossier) against hours available × weeks
   until the deadline. The coach states plainly which level is reachable by the deadline and
   when the levels beyond it would land. The user picks the target. "Expert programmer in a
   year" gets a real answer: what a year of 25 h/week buys, and what expert takes.

4. **Roadmap.** Phases → milestones. A milestone is one of: a **course** (textbook-driven), a
   **project**, a **competition**, an **assessment** (placement test, practice exam, the real
   exam), a **practice habit** (e.g. daily problems), or a **reading**. Each has hours, a start
   and due date planned backward from the deadline, dependencies, and a "done when" check the
   user can verify. Skills get project-heavy roadmaps; exams get practice-heavy ones.

5. **Courses, textbook-first.** A course wraps one or more textbooks: units map to chapters and
   sections, with exercise selections, projects and assessments. **The coach does not write
   lessons where a chosen textbook already covers the material.** It writes a lesson only for a
   marked gap (nothing good covers it, or the user said the book's explanation didn't work),
   and says why. Courses have placement tests, homework with due dates and answer keys,
   practice exams modeled on the real one, projects with rubrics, and a grading scheme, so they
   show up in Grade Calc like real courses.

6. **Down to tasks.** Units and projects become planner tasks with quantities (pages, problems,
   steps), estimates and due dates. Projects become task trees. Nothing is scheduled until the
   user approves the course.

7. **Keep it honest over time.** Progress on roadmap milestones is tracked. A monthly checkpoint
   (or a milestone slipping more than two weeks) makes the coach propose changes; it never
   changes the roadmap silently. Feedback after lessons, homework and exams updates the
   **teaching guide** and the upcoming units.

**Realism rules** (every coach prompt carries them):
- Estimates and recommendations cite sources. A book, course or competition without a verified
  link is marked unverified and never becomes a task on its own.
- Prefer existing excellent material over generated material. Prefer doing (projects, problems,
  competitions) over reading for skill goals.
- The coach may say a deadline is unrealistic and must then offer the realistic alternative.
- The user approves the dossier, the target level, the roadmap and each course before anything
  becomes work.

**Learns how to teach this user.** A "How I learn" page holds the user's own advice ("worked
examples before theory", "short lessons", etc.). The intake interview fills the gaps. The coach
keeps a concise, versioned **teaching guide** that every gap lesson, homework set and exam must
follow. The user can add notes any time (in the app, or by texting "coach: …") and attach their
own materials (textbooks, PDFs, links) to a goal.

**Weekly deep-research report**, run before the user's weekly usage reset (a setting; the
reset time is assigned per account): upcoming competitions and deadlines from the roadmaps, new
opportunities, ways to reach the big goals. Shown in the app and sent to the phone.

**Budget discipline.** Research runs in stages with the cheaper model gathering and the
stronger model synthesizing. Before a run, the app shows an estimate of how many turns and
usage windows it needs. The app never uses API keys; the only overflow the user may ever turn
on is Anthropic's own pay-as-you-go usage credits on the subscription, and only if they choose
to.

---

## Grade Calc

- Enter every course, grading category (with weights) and assignment with its score.
- See all grades per course: **current grade**, **max possible grade** (100% on everything
  remaining), and min possible grade.
- Supports weighted-category and points-based courses, and per-course letter scales.
- Self-study courses from the Life Coach appear here too, with textbook progress per course.

---

## Non-functional requirements

- **Standalone Windows app:** installer, tray icon, starts with Windows, keeps running in the
  tray when the window closes.
- **Claude through the user's subscription:** the app drives the user's own `claude` CLI. It
  never uses API keys or pay-per-token billing.
- **Extensible with Claude Code:** clear docs, a roadmap, small feature modules, tests.
- **Data safety from day one:** local SQLite database in WAL mode, a daily backup to a folder
  the user chooses (e.g. OneDrive; keep the last 14 days plus one per month), and a log file.
  Restore from a backup from inside the app.
- **Travel-safe:** see the time rule above.
~~~

### C3: New ADRs for the coach principle and the time-zone rule
- Why: F1, F7
- Needs owner decision: Q4 (book policy sentence), Q6 (ADR 0007 default anchor)
- Verify: both files exist and `docs/decisions/README.md` lists 0006 and 0007.

#### Write `docs/decisions/0006-textbook-first-roadmap-coach.md`
~~~md
# 0006 — The coach researches, checks reality and decomposes; it doesn't author textbooks

**Status:** Accepted (2026-10-02)

## Context
The first draft of the Life Coach described it as a course author: full college-style courses
with generated lectures. The owner's actual requirement is different: start from where they
are, research deeply what a goal really takes, be honest about what the deadline allows, build
a roadmap of textbooks, projects and competitions, and break it down until it's planner tasks.
Generated lecture notes are the most token-expensive output, the least reliable, and usually
worse than the canonical textbook on the topic. The app runs on a Pro plan with weekly caps.

## Decision
The coach is a pipeline with user approval between stages:
intake (starting point) → research dossier → reality check → roadmap → textbook-first courses →
planner tasks → periodic checkpoints.

Rules:
1. **Textbook-first.** A course unit must point at material (a textbook chapter/section range, a
   course, a problem set) or be explicitly marked as a *gap* with a reason. Lessons are
   generated only for gaps.
2. **Honest.** The reality check compares sourced hours-to-level estimates with real availability
   and names the reachable level by the deadline. The coach may say "not by then".
3. **Verified or flagged.** Every recommended book, course or competition carries a link the
   research job actually fetched, or is marked unverified and can't become a task on its own.
4. **Decompose all the way.** Goal → phases → milestones → courses/projects → units → tasks with
   quantities and estimates. The planner schedules tasks; the coach never writes blocks.
5. **Nothing silent.** Dossier, target level, roadmap and each course are approved by the user
   before work is created; checkpoints propose changes and wait.
6. **Budget-aware.** Research is staged and resumable; the cheaper model gathers, the stronger
   one synthesizes; estimates are shown before a run.

Book policy (owner decision 2026-10-02): free/open texts first; paid classics allowed when
clearly better, shown with price and a free alternative, approved by the user.

## Consequences
- Far fewer tokens per goal, spent on research and design instead of prose.
- New entities: GoalProfile, ResearchDossier (staged), Roadmap/Phase/Milestone, Material with
  locators, Unit.materialRefs, Competition fields; see ARCHITECTURE.
- Coach milestones are reordered: intake + research first, roadmap + courses second,
  assessments and gap lessons third.
- The teaching guide now governs gap lessons, homework and exams, not whole courses.
~~~

#### Write `docs/decisions/0007-local-time-recurrences.md`
~~~md
# 0007 — Instants in UTC; recurring fixed events in local time + IANA zone

**Status:** Accepted (2026-10-02)

## Context
The first spec said "times are stored in UTC". That is right for moments that happened (timer
sessions, completions, placed blocks) but wrong for recurring fixed events. A class "MWF 10:00
America/Chicago" stored as UTC moves by an hour at every daylight-saving change, and the sleep
floor would drift when the laptop travels. The M4 acceptance criterion tests exactly this.

## Decision
- **Instants** (TimeSession, Completion, Block start/end, Assignment dueAt, Task dueAt) are UTC
  ISO strings.
- **Recurring fixed events** store `startLocal` ("10:00"), `endLocal`, an RFC 5545 recurrence
  rule, and an IANA `timeZone`. The default zone is **America/Chicago** (owner decision, Q6) and
  does not follow the laptop. Expansion to concrete instants happens in `packages/core` with the
  zone passed in, using `Temporal` if available in the runtime or a small date-fns-tz style
  helper otherwise; never `Date` arithmetic on local time.
- **Display** always uses the laptop's current zone.
- Durations are minutes everywhere.

## Consequences
- The scheduler receives availability already expanded to UTC instants for the planning window.
- Tests must include a DST transition week (second Sunday of March, first Sunday of November).
- CLAUDE.md's time rule is updated to match.
~~~

#### Edit `docs/decisions/README.md`
Find:
~~~text
| [0005](0005-sqlite-drizzle.md) | SQLite via better-sqlite3 + Drizzle ORM | Accepted |
~~~
Replace with:
~~~text
| [0005](0005-sqlite-drizzle.md) | SQLite via better-sqlite3 + Drizzle ORM | Accepted |
| [0006](0006-textbook-first-roadmap-coach.md) | The coach researches, checks reality and decomposes; it doesn't author textbooks | Accepted |
| [0007](0007-local-time-recurrences.md) | Instants in UTC; recurring fixed events in local time + IANA zone | Accepted |
~~~

### C4: Rewrite ARCHITECTURE for the coach pipeline, bridge hardening, time and backups
- Why: F1, F4, F5, F6, F7, F10
- Needs owner decision: Q1 (milestone numbers below assume the recommended order), Q3
- Verify: every entity named in VISION's coach section has a row in the data model; the Claude
  bridge section mentions stdin, minimum version, flag table, working folder.

#### Write `docs/ARCHITECTURE.md`
~~~md
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
  `http(s)`/`mailto` links in the system browser (`src/main/security.ts`).
- **Main process**: owns the database, backups, the log, the scheduler runs, the timer, the AI
  job queue, the relay sync, the tray and notifications.
- **`packages/core`**: pure TypeScript domain logic with no I/O: zod schemas, grade math,
  recurrence expansion, the scheduler, the estimator, the coach's deterministic parts (reality
  check arithmetic, roadmap back-planning, unit → task decomposition). Used by main, the
  renderer and the relay. Most tests live here.
- **Relay** (M14): a tiny always-on mailbox, so the phone works while the laptop sleeps.

## Repository layout

```
packages/core/src/
  grades/        letter scales, course grade math (M1)
  time/          recurrence expansion with time zones, availability windows (M4)
  scheduler/     time-blocking + re-planning (M5–M6)
  estimator/     duration learning (M7)
  coach/         reality-check math, roadmap back-planning, decomposition to tasks (M11–M12)
  schemas/       shared zod schemas for domain objects and for Claude's structured outputs
apps/desktop/
  electron.vite.config.ts  electron-builder.yml  resources/ (icons)
  src/main/      index.ts (window, tray, lifecycle), security.ts (URL policy), ipc.ts
                 (validated dispatcher), handlers.ts (composes per-feature handler objects),
                 log.ts (M1), db/ (Drizzle schema + migrations + backup, M1),
                 features/<name>/ (services + that feature's IPC handlers),
                 ai/ (claude runner + job queue, M9)
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

## Storage, backups and logging (M1)

- SQLite in `%APPDATA%/School Assistant/school-assistant.db` (`app.getPath('userData')`),
  `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`. Drizzle migrations run on startup
  inside a transaction; a failed migration keeps the old file and shows an error screen.
- **Backup:** once a day (and on demand) `VACUUM INTO '<backupDir>/school-assistant-YYYY-MM-DD.db'`.
  Keep the last 14 daily files and the first of each month. `backupDir` is a setting with a
  default under the user's Documents folder; the Settings page lets the owner pick OneDrive.
  Restore = quit, copy the chosen file over the live DB, relaunch (M8 adds the UI).
- **Log:** `electron-log` to `app.getPath('logs')`, daily files, 7 kept, `info` by default.
  Every AI job writes its command line (without prompt text), duration, usage and outcome.
- The database and logs are never committed.

## Data model (target)

Built a little per milestone with Drizzle migrations. Instants are UTC ISO strings; recurring
events keep local time + IANA zone (ADR 0007); durations are minutes.

| Entity | Key fields | Milestone |
|---|---|---|
| Setting | key, value (JSON) | M1 |
| Course | name, code, term, kind (`enrolled`/`self_study`), grading (`weighted`/`points`), letterScale, color, goalId?, milestoneId?, primaryMaterialIds | M1 |
| GradeCategory | courseId, name, weight, dropLowest | M1 |
| Assignment | courseId, categoryId, title, dueAt, pointsPossible, pointsEarned?, unitId? | M1 |
| Task | title, description, courseId?, assignmentId?, unitId?, parentId?, type, quantity+unit, estimateMin, dueAt?, earliestStart?, priority, splittable, minChunkMin, attention (`focus`/`light`/`background`), steps, today (bool + order), status | M3 |
| TimeSession | taskId, startAt, endAt?, source (`desktop`/`phone`/`manual`) | M3 |
| Completion | taskId, completedAt, summary | M3 |
| FixedEvent | title, kind (`class`/`sleep`/`meal`/`hygiene`/`other`), startLocal, endLocal, rrule, timeZone, exceptions | M4 |
| Block | taskId?, startAt, endAt, locked, planVersion, reason | M4–M6 |
| AiJob | kind, priority, modelAlias, sessionId, stage, status (`queued`/`running`/`waiting_for_reset`/`done`/`failed`/`cancelled`), input, output, usage, costEstimate, resumeAfter, attempts | M9 |
| LearnerProfile | user notes ("How I learn"), Claude-maintained teaching guide, version | M11 |
| Goal | title, why, deadline, kind (`exam`/`skill`/`project`/`other`), status, targetLevel? | M11 |
| GoalProfile | goalId, intake answers (JSON), diagnostic results, weeklyHours, version | M11 |
| ResearchDossier | goalId, version, stages[] {name, status, sessionId, markdown, data}, levels[] {name, markers, hoursLow, hoursHigh, sources}, approvedAt | M11 |
| Material | goalId?, kind (`textbook`/`course`/`pdf`/`link`/`video`/`problem_set`/`note`), title, author, url, isbn?, cost, isFree, verifiedAt?, ownedByUser, path? | M11 |
| Citation | dossierId, url, title, fetchedAt, quote | M11 |
| Roadmap | goalId, version, targetLevel, approvedAt | M12 |
| Phase | roadmapId, order, title, goalOfPhase | M12 |
| Milestone | phaseId, kind (`course`/`project`/`competition`/`assessment`/`habit`/`reading`), title, doneWhen, hours, startBy, dueBy, dependsOn[], status, courseId?, materialIds[], competition {url, cadence, nextDate, eligibility}?, evidence[] | M12 |
| Unit | courseId, order, title, kind (`reading`/`project`/`assessment`/`gap_lesson`), materialRefs[] {materialId, locator, exercises}, gapReason?, hours, startBy, dueBy | M12 |
| Assessment | unitId, kind (`homework`/`quiz`/`placement`/`practice_exam`/`exam`/`project`), dueAt, points, content, answerKey, rubric, scores per question/topic | M13 |
| Lesson | unitId (gap units only), markdown, teachingGuideVersion | M13 |
| Feedback | unitId/assessmentId, rating, comment, appliedToGuideVersion | M13 |
| CoachNote | goalId?, text, source (`app`/`phone`/`feedback`) | M11 |
| RelayCursor / Reminder / PhoneEvent | sync state with the relay | M14 |
| Report | kind (`weekly_research`/`weekly_review`/`checkpoint`), weekOf, markdown, data | M16 |

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
  existing placements (stickiness) so the plan doesn't churn. Sick-day mode drops everything but
  tasks due within 24 h and re-plans tomorrow.
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

Facts this design relies on were checked against the Claude Code headless docs on 2026-10-02
(see D1–D4 in the review for what to re-check).

- **Invocation:** spawn the user's installed CLI with the prompt on **stdin** (Windows command
  lines are capped at ~32 K characters; stdin is capped at 10 MB) and flags
  `-p --output-format json --json-schema <schema> --model <alias> --permission-mode dontAsk
  --permission-prompts none --max-turns <n> [--allowedTools …] [--resume <id>]`. **Never
  `--bare`**: bare mode ignores the subscription login (ADR 0003).
- **Flags live in a table** (`ai/cli-flags.ts`) with the minimum CLI version each one needs, so
  when `--bare` becomes the default for `-p` (announced) the fix is one entry, not a redesign.
  Settings shows "Claude Code v2.1.xxx found, logged in" and refuses to run jobs below the
  minimum version (2.1.259).
- **Windows:** resolve the real executable (`where claude` → `claude.cmd` → run through
  `cmd /c`, or the native `claude.exe` if installed) once, cache it, re-check on failure.
- **Working folder:** `<userData>/ai-work/<jobId>/`, empty except for job inputs. Because `-p`
  without `--bare` loads `~/.claude` settings and any `CLAUDE.md`/`.mcp.json` in the folder,
  the folder never contains those, and `--setting-sources` is used to limit what loads (D4).
- **Model tiers** are aliases from Settings (`haiku` quick parsing, `sonnet` default and
  research gathering, `opus` synthesis and roadmap design). New model versions need no code
  change.
- **Structured intents, not free rein:** Claude returns JSON validated by zod schemas from core
  (`structured_output` field). The app applies them. Claude never edits the database.
- **Job queue:** priority phone > daily > deep work; one job at a time. Each job records
  `session_id`, `usage`, `total_cost_usd` (client-side estimate) for the usage meter. A result
  with `is_error` whose text indicates a usage limit, or an `api_retry` event with
  `error: "rate_limit"`, moves the job to `waiting_for_reset` with `resumeAfter` from the
  message when present (else +60 min, doubling). Resume uses `--resume <sessionId>`.
- **Long jobs** (research, roadmap, weekly report) are multi-stage: each stage is its own `-p`
  call that resumes the same session, so a limit between stages loses nothing. They hold
  `powerSaveBlocker` and show an estimate (turns, windows) before starting.
- **Cancel:** SIGINT first (ends the turn), SIGTERM after 10 s.
- **Tests** use a fake `claude` executable (a Node script on PATH) that returns fixture JSON,
  including a usage-limit fixture. CI never needs a login.

## Coach pipeline (M11–M13, `features/coach` + `packages/core/src/coach`)

Each stage is an AiJob kind with its own zod output schema; the user approves between stages.

| Stage | Model | Tools | Output |
|---|---|---|---|
| 0 Intake | sonnet | none | GoalProfile (adaptive interview rendered as a form; optional diagnostic) |
| 1 Research a: destination & levels | sonnet | WebSearch, WebFetch | levels[] with markers, exam facts, sources |
| 1 Research b: curricula & sequencing | sonnet | WebSearch, WebFetch | topic graph, order, sources |
| 1 Research c: materials | sonnet | WebSearch, WebFetch | Material[] with verified URLs, cost, free alternative |
| 1 Research d: practice & competitions | sonnet | WebSearch, WebFetch | projects ladder, problem sets, competitions with dates |
| 1 Research e: time & pitfalls | sonnet | WebSearch, WebFetch | hours per level with sources, failure modes |
| 1 Synthesis | opus | none | dossier markdown + merged structured data |
| 2 Reality check | **core (deterministic)** + opus for wording | none | reachable level by deadline, dates for later levels |
| 3 Roadmap | opus | none | Phases/Milestones, back-planned in core |
| 4 Course builder | opus | WebFetch (tables of contents) | Course + Units with materialRefs; gaps justified |
| 5 Decomposition | **core** | none | Tasks with quantities, estimates from estimator priors, due dates |
| 6 Checkpoint | sonnet | none | proposed roadmap changes (never applied automatically) |

Rules enforced in code, not only in prompts: a Unit of kind `reading`/`project`/`assessment`
must have at least one `materialRef` or be `gap_lesson` with `gapReason`; a Material without
`verifiedAt` can't be referenced by a Unit; roadmap dates can't exceed the goal deadline; total
roadmap hours can't exceed availability (the reality check's numbers) by more than 10% without
a visible warning.

## Phone relay (M14–M15, `apps/relay`)

- A Cloudflare Worker is the Telegram bot's webhook (set with a `secret_token`). D1 holds an
  **outbox** (reminders with a send time) and an **inbox** (button taps, texts and photos, each
  with a server timestamp).
- A cron trigger runs every minute and sends due reminders, so they arrive while the laptop
  sleeps.
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
| Main-process services | Vitest with `electron` mocked | `apps/desktop/src/main/**/*.test.ts` |
| AI features | Vitest + fake `claude` executable | M9 |
| End-to-end smoke | Playwright `_electron` | M3 |

`pnpm check` runs lint, typecheck and tests. CI runs it on Ubuntu and Windows.
~~~

### C5: Rewrite the roadmap into one-session milestones in the new order
- Why: F1, F2, F3, F4, F11, P1, P8
- Needs owner decision: Q1 (written for the recommended order; for option 2 swap M11–M13 with
  M14–M15 and renumber), Q2, Q5
- Verify: each milestone has an AC; CLAUDE.md and ARCHITECTURE milestone references match.

#### Write `docs/ROADMAP.md`
~~~md
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
- [x] Review applied: window URL policy (`security.ts`), IPC parsed-input type, installer config

## M1 — Database, backups, log, grade math

- [ ] Drizzle + better-sqlite3 in main (`src/main/db/`): WAL, foreign keys, migrations on
      startup in a transaction, error screen if a migration fails; `Setting` table
- [ ] Daily backup (`VACUUM INTO`) to a folder setting (default under Documents; folder picker
      in Settings), keep last 14 + first of month; "Back up now" button
- [ ] `electron-log` → `app.getPath('logs')`; IPC handler errors logged
- [ ] Core: course grade math for weighted-category and points-based courses, drop-lowest,
      extra credit; current %, **max possible %** (100% on everything ungraded), min possible %
- [ ] Course / GradeCategory / Assignment tables and IPC channels (no screens yet beyond a
      debug list)
- [ ] **Claude CLI spike (manual, owner's laptop):** run
      `echo "Return ok" | claude -p --output-format json --json-schema '{"type":"object","properties":{"ok":{"type":"boolean"}},"required":["ok"]}'`
      while logged in; record CLI version, whether `structured_output` came back, and how
      a usage-limit message looks, in STATUS gotchas

**AC:** the DB file appears in userData, a backup file appears in the backup folder, the log
file records startup; core grade math has unit tests covering weighted, points, drops, extra
credit and no grades yet; the CLI spike result is in STATUS.

## M2 — Courses & Grade Calc screens

- [ ] Courses CRUD (term, code, color, letter scale, grading type) and categories with weights
      (validate the weights sum to 100%)
- [ ] Assignments CRUD with due date, points possible/earned; fast keyboard entry; bulk paste
      ("HW 1, 10/7, 20 pts" lines)
- [ ] Grades page: overview card per course (current / max / min + letter) and a course detail
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
- [ ] **Sick day / travel mode** (one action; silences reminders; re-plans tomorrow)
- [ ] Property tests for stability: a 30-minute late start moves only what it must

**AC:** a 30-minute late start moves only what it must; sick-day mode leaves only work due
within 24 h.

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
      restricted tools; `--max-turns`; timeouts; Windows executable resolution
- [ ] Job queue in DB with priorities (phone > daily > deep work), usage-limit detection →
      `waiting_for_reset` → resume via `--resume`; retries; cancel (SIGINT then SIGTERM)
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

## M11 — Coach I: learner profile, goal intake, research, reality check

- [ ] **"How I learn" page**: free-form advice; intake interview fills gaps; versioned
      **teaching guide** injected into coach prompts
- [ ] Goals: title, why, deadline, kind; coach notes (app, later phone); attach own materials
- [ ] **Goal intake interview** (stage 0): adaptive questions rendered as a form; weekly hours
      pulled from availability; optional diagnostic; produces GoalProfile
- [ ] **Deep research job** (stages 1a–1e + synthesis, resumable, `powerSaveBlocker`):
      levels with markers, curricula, materials with verified URLs, projects/competitions,
      hours per level with sources, pitfalls → dossier page with citations
- [ ] **Reality check** (core math + wording): reachable level by deadline; the user picks the
      target level
- [ ] Estimate shown before research starts; approval buttons for dossier and target

**AC:** for "Pass the UH Calculus 1 departmental exam" and "Become an expert programmer in a
year" (with fixture research output in tests, and one real run on the laptop), the app produces
an intake form, a cited dossier with at least three verified materials, and a reality check
that names the reachable level; nothing is scheduled yet.

## M12 — Coach II: roadmap & textbook-first courses → planner

- [ ] **Roadmap** (stage 3): phases and milestones (course / project / competition /
      assessment / habit / reading), back-planned in core from the deadline and weekly hours;
      "done when" per milestone; roadmap page with approve/edit
- [ ] **Course builder** (stage 4): units mapped to textbook chapters/sections and exercises;
      projects; gaps justified; grading scheme; approved courses appear in Grades as
      self-study with textbook progress
- [ ] **Decomposition** (stage 5, core): units/projects → tasks with quantities, estimates and
      due dates; scheduled by the planner after approval
- [ ] Code-enforced rules from ARCHITECTURE (materialRef or gap; verified materials only; dates
      inside the deadline)

**AC:** an approved roadmap for the programming goal contains projects and at least one
competition; its first course references real chapters of a verified textbook, contains no
generated lesson for material the book covers, and turns into scheduled tasks.

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
      backfill, "I'm sick today" → sick-day mode, coach note) → app applies → re-plan →
      confirmation with diff
- [ ] Photo of a worksheet/assignment → tasks (with confirmation buttons)
- [ ] Clarifying questions when the intent is ambiguous

**AC:** ten representative messages (fixtures) map to the right intents; no message can change
data without passing schema validation.

## M16 — Weekly research report, review & roadmap checkpoint

- [ ] Scheduled job before the user's weekly usage reset (day/time setting)
- [ ] Research: upcoming competitions and deadlines from the roadmaps, new opportunities, ways
      to reach each goal; cited
- [ ] **Roadmap checkpoint** (stage 6): progress vs plan per goal; proposed changes await approval
- [ ] Report page; Telegram summary plus the full report as a file
- [ ] Weekly review: planned vs done, deep-work hours, estimate accuracy, grades trend, hours
      by goal

**AC:** the report generates on schedule with citations and reaches the phone; the weekly
review numbers match the timer data; a slipped milestone produces a checkpoint proposal.

## M17+ — Backlog

Pull from [IDEAS.md](IDEAS.md) with the user.
~~~

### C6: Rewrite STATUS for the next session
- Why: F2, F3, F10
- Needs owner decision: none (the apply session fills in the owner's answers)
- Verify: STATUS points to M1 and lists the new gotchas.

#### Write `docs/STATUS.md`
~~~md
# Status

The handoff note between sessions. **Read this first and update it last.**

_Last updated: 2026-10-02 (session 2: Fable review applied)_

## Where things stand

- **M0 Foundation is done** and the review is applied: VISION/ARCHITECTURE/ROADMAP were
  rewritten around the real Life Coach (ADR 0006), the time rule changed (ADR 0007), the window
  URL policy is enforced (`src/main/security.ts`), and the roadmap is re-cut into one-session
  milestones.
- Nothing is stored yet: there is no database and no real features.
- Owner decisions from the review are recorded in `docs/VISION.md` (and ADRs 0006–0007).
  Rejected pitches are in `docs/IDEAS.md`.

## Next session: M1 — Database, backups, log, grade math

Build in this order: `electron-log` + `src/main/log.ts`; better-sqlite3 + Drizzle in
`src/main/db/` (WAL, migrations, `Setting` table); the daily `VACUUM INTO` backup with a folder
setting; core grade math in `packages/core/src/grades/` (tests first); Course/Category/Assignment
tables and IPC channels. Ask the owner to run the **Claude CLI spike** command from the M1
checklist on their laptop and paste the output; record the CLI version and the result here.
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
- **better-sqlite3 13** ships N-API prebuilt binaries (including win32-x64) inside the package.
  The spike confirmed it loads under Node 22 and Electron 44 (Node 24.21, ABI 149) with no
  compiler. `node:sqlite` also works in Electron 44, but Drizzle 0.45 has no driver for it, so
  the choice is better-sqlite3 (ADR 0005). `electron-builder.yml` has `npmRebuild: false` for
  this reason; confirm on the first `dist` that the `.node` file is unpacked and loads.
- `@sa/core` is a source-only workspace package (`exports` → `src/index.ts`). It must stay in
  the desktop app's **devDependencies** so electron-vite bundles it instead of externalizing it.
- pnpm prints an "Ignored build scripts: electron-winstaller" warning. It's harmless (Squirrel
  tooling we don't use).
- Headless checks in cloud sessions: run Electron under `Xvfb :99` with `--no-sandbox
  --disable-gpu`. Playwright's `_electron` works (global Playwright at
  `/opt/node-tools/node_modules/playwright` in the cloud image).
- **Claude CLI facts (docs, 2026-10-02):** `--bare` ignores the subscription login and is
  announced to become the default for `-p`; `--permission-prompts none` needs v2.1.259+;
  prompts go through stdin (argv is limited on Windows; stdin capped at 10 MB); `-p` without
  `--bare` loads `~/.claude` settings, hooks and MCP servers and any `CLAUDE.md` in the working
  folder. See ARCHITECTURE "Claude bridge".
- **Time:** instants in UTC; recurring fixed events in local time + IANA zone (ADR 0007).

## Open questions for the user

- Result of the Claude CLI spike (M1 checklist). Not blocking for M1's code.
- One real UH syllabus for M2 test data.
~~~

### C7: Update CLAUDE.md to match
- Why: F3, F7, F10
- Needs owner decision: Q1 (relay milestone number)
- Verify: `grep -n "M8\|UTC" CLAUDE.md` shows only the new wording.

#### Edit `CLAUDE.md`
Find:
~~~text
A personal Windows app for one UH student: a **Planner** (auto time-blocking + task timer),
a **Life Coach** (deep goal research → full self-study courses with homework and exams), and
**Grade Calc**. iPhone via a Telegram bot; AI via the user's own Claude Pro subscription.
~~~
Replace with:
~~~text
A personal Windows app for one UH student: a **Planner** (auto time-blocking + task timer),
a **Life Coach** (where you start → deep research → honest reality check → roadmap of
textbooks, projects and competitions → textbook-first courses → planner tasks), and
**Grade Calc**. iPhone via a Telegram bot; AI via the user's own Claude Pro subscription.
~~~

#### Edit `CLAUDE.md`
Find:
~~~text
**End of every session**
1. `pnpm check` must pass (lint + typecheck + tests).
2. Tick finished items in `docs/ROADMAP.md`; rewrite `docs/STATUS.md` (done / next / gotchas /
   open questions).
3. Record new architectural decisions as a new ADR (`docs/decisions/000N-*.md` + index).
4. Commit, push, and open or update the PR.
~~~
Replace with:
~~~text
**End of every session**
1. `pnpm check` must pass (lint + typecheck + tests).
2. Tick finished items in `docs/ROADMAP.md`; rewrite `docs/STATUS.md` (done / next / gotchas /
   open questions).
3. Record new architectural decisions as a new ADR (`docs/decisions/000N-*.md` + index).
4. Commit, push, and open or update the PR.

**Running out of time or usage mid-milestone:** stop at a clean point (tests green, no
half-wired UI), commit, and list exactly what's left under "Next session" in `docs/STATUS.md`.
Never leave the app unusable between sessions.
~~~

#### Edit `CLAUDE.md`
Find:
~~~text
- `apps/desktop/src/shared/ipc.ts` — the IPC contract (zod schemas for every channel). New
  renderer→main call = add a channel here + a handler in `src/main/handlers.ts`.
~~~
Replace with:
~~~text
- `apps/desktop/src/shared/ipc.ts` — the IPC contract (zod schemas for every channel). New
  renderer→main call = add a channel here + a handler in the feature's handler object under
  `src/main/features/<feature>/`, which `src/main/handlers.ts` spreads together. Handlers
  receive the parsed input (`IpcParsedInput`).
~~~

#### Edit `CLAUDE.md`
Find:
~~~text
- `apps/relay` — Cloudflare Worker for Telegram (arrives in M8).
- Style: TypeScript strict, Biome formatting (2 spaces, single quotes, 100 cols). Tests next to
  code as `*.test.ts`. Times are stored in UTC; durations are in minutes.
~~~
Replace with:
~~~text
- `apps/relay` — Cloudflare Worker for Telegram (arrives in M14).
- Style: TypeScript strict, Biome formatting (2 spaces, single quotes, 100 cols). Tests next to
  code as `*.test.ts`. Instants are stored in UTC; recurring fixed events store local time + an
  IANA zone (ADR 0007); durations are in minutes.
~~~

#### Edit `CLAUDE.md`
Find:
~~~text
- Claude is invoked only through the user's `claude` CLI **without `--bare`** so it uses the
  subscription (ADR 0003). Claude returns schema-validated data/intents; the app applies them.
  Never add API keys or paid-API code paths.
~~~
Replace with:
~~~text
- Claude is invoked only through the user's `claude` CLI **without `--bare`** so it uses the
  subscription (ADR 0003). Prompts go through stdin; CLI flags live in one table with minimum
  versions (ARCHITECTURE "Claude bridge"). Claude returns schema-validated data/intents; the
  app applies them. Never add API keys or paid-API code paths.
- The Life Coach is textbook-first (ADR 0006): a course unit points at real material or is an
  explicitly justified gap. Never generate lessons for material a chosen textbook covers. The
  user approves dossier, target level, roadmap and each course before tasks are created.
- Renderer URL policy: links open externally only if `isSafeExternalUrl`; navigation only if
  `isAllowedNavigation` (`src/main/security.ts`). Don't bypass these for new features.
~~~

### C8: Harden the window (URL policy, permissions, menu)
- Why: F8
- Needs owner decision: none
- Verify: `pnpm check` passes with 5 new tests; `pnpm dev` still opens the app; clicking an
  `https://` link in a future page opens the browser; a `file:` link does nothing.

#### Write `apps/desktop/src/main/security.ts`
~~~ts
/**
 * URL policy for the renderer window. Pure functions, so they are unit-tested without Electron.
 * Wired up in index.ts: links go to the default browser, navigation stays inside the app.
 */

/** Protocols that may be handed to the operating system via shell.openExternal. */
const EXTERNAL_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/** True for links that are safe to open in the user's browser or mail client. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    return EXTERNAL_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export interface NavigationPolicy {
  /** Dev server URL from electron-vite (process.env.ELECTRON_RENDERER_URL); unset in production. */
  devServerUrl?: string;
}

/**
 * True when the renderer may navigate to `url`: the dev server origin while developing, or the
 * app's own file:// bundle. Hash-only route changes never reach this check.
 */
export function isAllowedNavigation(url: string, policy: NavigationPolicy): boolean {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return false;
  }
  if (policy.devServerUrl) {
    try {
      return target.origin === new URL(policy.devServerUrl).origin;
    } catch {
      return false;
    }
  }
  return target.protocol === 'file:';
}
~~~

#### Write `apps/desktop/src/main/security.test.ts`
~~~ts
import { describe, expect, it } from 'vitest';
import { isAllowedNavigation, isSafeExternalUrl } from './security';

describe('isSafeExternalUrl', () => {
  it('accepts web and mail links', () => {
    expect(isSafeExternalUrl('https://openstax.org/details/books/calculus-volume-1')).toBe(true);
    expect(isSafeExternalUrl('http://example.com')).toBe(true);
    expect(isSafeExternalUrl('mailto:someone@uh.edu')).toBe(true);
  });

  it('rejects local files, custom schemes and garbage', () => {
    expect(isSafeExternalUrl('file:///C:/Windows/System32/cmd.exe')).toBe(false);
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeExternalUrl('ms-settings:')).toBe(false);
    expect(isSafeExternalUrl('not a url')).toBe(false);
    expect(isSafeExternalUrl('')).toBe(false);
  });
});

describe('isAllowedNavigation', () => {
  it('allows only the dev server origin while developing', () => {
    const policy = { devServerUrl: 'http://localhost:5173/' };
    expect(isAllowedNavigation('http://localhost:5173/index.html#/today', policy)).toBe(true);
    expect(isAllowedNavigation('http://localhost:5173/other', policy)).toBe(true);
    expect(isAllowedNavigation('http://localhost:5174/', policy)).toBe(false);
    expect(isAllowedNavigation('https://evil.example', policy)).toBe(false);
    expect(isAllowedNavigation('file:///C:/app/out/renderer/index.html', policy)).toBe(false);
  });

  it('allows only the bundled file:// pages in production', () => {
    const policy = {};
    expect(isAllowedNavigation('file:///C:/app/out/renderer/index.html#/grades', policy)).toBe(
      true,
    );
    expect(isAllowedNavigation('https://evil.example', policy)).toBe(false);
    expect(isAllowedNavigation('http://localhost:5173/', policy)).toBe(false);
  });

  it('rejects unparsable URLs', () => {
    expect(isAllowedNavigation('nope', {})).toBe(false);
    expect(isAllowedNavigation('https://ok.example', { devServerUrl: 'nope' })).toBe(false);
  });
});
~~~

#### Write `apps/desktop/src/main/index.ts`
~~~ts
import { join } from 'node:path';
import { app, BrowserWindow, Menu, session, shell, type Tray } from 'electron';
import icon from '../../resources/icon.png?asset';
import { createHandlers } from './handlers';
import { registerIpcHandlers } from './ipc';
import { isAllowedNavigation, isSafeExternalUrl } from './security';
import { createTray } from './tray';

// Sets the userData folder to %APPDATA%/School Assistant (also in development).
app.setName('School Assistant');

let mainWindow: BrowserWindow | null = null;
// Module-level so the tray icon is not garbage-collected.
let tray: Tray | null = null;
let quitting = false;

const devServerUrl = process.env.ELECTRON_RENDERER_URL;

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: 'School Assistant',
    icon,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  // Links open in the default browser, never inside the app. Only web/mail links get through.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  // The renderer never navigates away from the app (dev server in development, file:// in prod).
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, { devServerUrl })) event.preventDefault();
  });

  // Closing the window hides it; the app keeps running in the tray.
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return win;
}

function showWindow(): void {
  if (!mainWindow) mainWindow = createWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('before-quit', () => {
    quitting = true;
    tray?.destroy();
  });

  void app.whenReady().then(() => {
    app.setAppUserModelId('com.schoolassistant.app');
    // No web permissions (camera, geolocation, etc.) are ever needed by the renderer.
    session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
      callback(false),
    );
    // The packaged app has no menu bar; this also drops the DevTools and reload shortcuts.
    if (app.isPackaged) Menu.setApplicationMenu(null);
    registerIpcHandlers(createHandlers());
    mainWindow = createWindow();
    tray = createTray(icon, showWindow);
  });

  // Stay alive in the tray when every window is closed.
  app.on('window-all-closed', () => {});
}
~~~

### C9: Handlers receive the parsed IPC input
- Why: F9
- Needs owner decision: none
- Verify: `pnpm typecheck` passes; existing `ipc.test.ts` still passes.

#### Edit `apps/desktop/src/shared/ipc.ts`
Find:
~~~text
export type IpcInput<C extends IpcChannel> = z.input<IpcContract[C]['input']>;
export type IpcOutput<C extends IpcChannel> = z.output<IpcContract[C]['output']>;
~~~
Replace with:
~~~text
/** What the renderer passes in (before validation). */
export type IpcInput<C extends IpcChannel> = z.input<IpcContract[C]['input']>;
/** What a main-process handler receives (after validation, defaults applied). */
export type IpcParsedInput<C extends IpcChannel> = z.output<IpcContract[C]['input']>;
export type IpcOutput<C extends IpcChannel> = z.output<IpcContract[C]['output']>;
~~~

#### Edit `apps/desktop/src/main/ipc.ts`
Find:
~~~text
import { type IpcChannel, type IpcInput, type IpcOutput, ipcContract } from '../shared/ipc';

type Handler<C extends IpcChannel> = (input: IpcInput<C>) => IpcOutput<C> | Promise<IpcOutput<C>>;
~~~
Replace with:
~~~text
import { type IpcChannel, type IpcOutput, type IpcParsedInput, ipcContract } from '../shared/ipc';

type Handler<C extends IpcChannel> = (
  input: IpcParsedInput<C>,
) => IpcOutput<C> | Promise<IpcOutput<C>>;
~~~

### C10: Remove the dangling tsconfig include
- Why: F10
- Needs owner decision: none
- Verify: `pnpm typecheck` passes.

#### Edit `apps/desktop/tsconfig.web.json`
Find:
~~~text
  "include": ["src/renderer/src", "src/preload/index.d.ts", "src/shared"]
~~~
Replace with:
~~~text
  "include": ["src/renderer/src", "src/shared"]
~~~

### C11: Installer config for native modules and no publishing
- Why: F12
- Needs owner decision: none
- Verify: `pnpm build` passes; on Windows (M8) `pnpm --filter @sa/desktop dist` produces an
  installer without attempting a native rebuild.

#### Write `apps/desktop/electron-builder.yml`
~~~yaml
# Windows installer config. Build with `pnpm --filter @sa/desktop dist` on Windows.
appId: com.schoolassistant.app
productName: School Assistant
directories:
  buildResources: resources
  output: release/${version}
files:
  - out/**
  - resources/**
  - package.json
# Native modules (better-sqlite3 from M1) ship N-API prebuilt binaries, so there is nothing to
# compile. Rebuilding would need Visual Studio Build Tools on the laptop.
npmRebuild: false
asarUnpack:
  - resources/**
  - "**/*.node"
# Personal app: never try to upload a release anywhere.
publish: null
win:
  target: nsis
  icon: resources/icon.ico
nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  createDesktopShortcut: true
  shortcutName: School Assistant
~~~

### C12: CI job timeout
- Why: F13
- Needs owner decision: none
- Verify: the workflow file parses; CI runs.

#### Edit `.github/workflows/ci.yml`
Find:
~~~text
    runs-on: ${{ matrix.os }}
    steps:
~~~
Replace with:
~~~text
    runs-on: ${{ matrix.os }}
    timeout-minutes: 20
    steps:
~~~

### C13: Park the old "generate full lectures" idea and record the review's rejected pitches
- Why: F1 (so a future session doesn't re-add lecture generation by default)
- Needs owner decision: none (the apply session adds rows for any pitch the owner rejects)
- Verify: IDEAS.md has the new row.

#### Edit `docs/IDEAS.md`
Find:
~~~text
| Streaks & scoreboard | Deep-work hours per day, plan adherence %, streaks | After M5 has data |
~~~
Replace with:
~~~text
| Streaks & scoreboard | Deep-work hours per day, plan adherence %, streaks | After M5 has data |
| Generated lecture notes for whole courses | Claude writes the lessons for every unit | Replaced by textbook-first courses (ADR 0006); lessons are generated only for justified gaps |
| Automatic roadmap re-planning | The coach changes the roadmap on its own when progress slips | Rejected in the review: the coach proposes, the user approves (ADR 0006) |
~~~

## 6. Double-check online

- **D1 — `--bare` becoming the default for `-p`.** Claim: the headless docs say it "will become
  the default for `-p` in a future release", and bare mode never reads the subscription login.
  Check: https://code.claude.com/docs/en/headless and the CLI reference for a `--no-bare` flag
  or equivalent, and the Claude Code changelog. If it has flipped: add the opposite flag to
  `ai/cli-flags.ts` in M9 and bump the minimum version; if `-p` can no longer use the
  subscription at all, that invalidates ADR 0003 and the owner must decide (usage credits via
  the subscription vs. not using AI features) before M9 starts.
- **D2 — Minimum CLI version.** Claim: `--permission-prompts` needs v2.1.259+, schema
  validation errors v2.1.205+, Windows stdin fix v2.1.211. Check the CLI reference/changelog;
  set the minimum in M9 to the highest of these (or newer if D1 adds a flag).
- **D3 — How a usage-limit hit looks in `-p` JSON output.** Claim: `is_error: true` with a
  result text that mentions the limit and a reset time; `stream-json` emits `system/api_retry`
  with `error: "rate_limit"`. Check by running the M1 spike when the owner has actually hit a
  limit (or search Claude Code GitHub issues for "usage limit" "-p" "is_error"). The detection
  code in M9 depends on the exact shape; keep it a regex table in one file.
- **D4 — `--setting-sources` and subscription login.** Claim: `--setting-sources` limits which
  settings files load; auth comes from credentials, not settings, so restricting sources should
  not break login. Check the CLI reference and try `--setting-sources user` in the spike. If it
  breaks login, drop the flag and rely on the empty working folder.
- **D5 — Opus on Pro and the weekly meter.** Claim: Pro includes Opus in Claude Code in 2026 with
  one weekly limit across all models (Max shows a separate Opus bar). Check
  https://support.claude.com (Pro plan article, "how do usage and length limits work"). If Opus
  isn't included, the `opus` alias falls back to `sonnet` for synthesis in M11.
- **D6 — Personal scripted use of the CLI on a subscription.** Claim: the legal page permits an
  end user running the unmodified CLI with their own subscription; limits "assume ordinary,
  individual usage"; usage credits exist as pay-as-you-go on Pro. Check
  https://code.claude.com/docs/en/legal-and-compliance and the Pro plan help article before
  M9. If the wording changes to exclude scripted personal use, stop and ask the owner.
- **D7 — better-sqlite3 13.0.3 prebuilt binary for Electron 44.** Claim: the package depends on
  `node-addon-api` (N-API) and ships or downloads a win32-x64 prebuilt that Electron 44 loads
  without compiling; `npmRebuild: false` is therefore correct. Check on the first `pnpm
  install` in M1 (does `prebuild-install` run? does it need network?) and on the first `dist`
  in M8 that `out/**/*.node` is unpacked and loads. If a rebuild is needed after all, set
  `npmRebuild: true` and document the Build Tools requirement.
- **D8 — Cloudflare Workers free tier: cron triggers and D1.** Claim: free plan allows cron
  triggers and D1 within generous daily limits. Check https://developers.cloudflare.com (Workers
  limits, D1 pricing) before M14. If cron isn't free, the fallback is a 1-minute Telegram
  long-poll from the laptop only (reminders then only while awake) and the owner decides.
- **D9 — Telegram `secret_token` on `setWebhook`.** Claim: Bot API supports a secret header the
  Worker verifies. Check https://core.telegram.org/bots/api#setwebhook before M14.

## 7. Notes for the applying session

- **Order:** C1 → C2 → C3 → C4 → C5 → C6 → C7 (docs, all depend on the owner's answers to
  Q1–Q6), then C8 → C12 (code, no decisions), then C13. Commit docs and code separately, e.g.
  "Apply C1–C7: coach spec, ADRs 0006–0007, roadmap re-cut" and "Apply C8–C12: window URL
  policy, IPC parsed input, installer config".
- **Q1 option 2** (phone before coach): in C5 swap the M11–M13 block with the M14–M15 block and
  renumber; then fix the milestone numbers in C4 (ARCHITECTURE table and headings), C7 (relay
  milestone) and C6.
- **Q6 option 2** (follow the laptop zone): change ADR 0007's default-zone sentence and the
  "Houston by default" phrases in C2 and C4.
- **Q4/Q3:** edit the marked policy sentences in C2 and ADR 0006 if the owner picks
  non-recommended options.
- The code in C8–C12 was applied in a sandbox clone of this commit: `pnpm check` (lint,
  typecheck, 17 tests) and `pnpm build` pass. Biome formatting is already applied; if your
  Biome version formats differently, run `pnpm lint:fix`.
- C8 changes behavior visible only at runtime (`will-navigate`, permission handler, menu). The
  dev server URL from electron-vite is an origin like `http://localhost:5173`; the policy
  compares origins, so HMR and hash routes are unaffected. If `pnpm dev` ever shows a blank
  window after this change, log the blocked URL in the `will-navigate` handler to see why.
- `Menu.setApplicationMenu(null)` only applies when packaged, so DevTools shortcuts still work
  in `pnpm dev`.
- The apply-review prompt says to save this file as `docs/reviews/2026-10-02-fable-review.md`.
  Add "Verification results" (D1–D9) and the "Apply log" at the end as instructed.
- Budget correction from the owner: the review budget is $20. The only place in the repo that
  named a figure was `docs/prompts/README.md` ("$13"); C1 fixes it. `fable-review.md` itself
  never named a number.
- Nothing in this review researches the owner's specific goals (exam formats, which C++ book,
  etc.). That is the coach's job at runtime; the review only shapes the pipeline that will do
  it.

---

## Owner answers (2026-10-02)

Recorded in `docs/VISION.md` → "Decisions log".

- **Q1:** recommended. Planner core → Claude bridge → Life Coach → Phone.
- **Q2:** recommended. A folder the owner picks in Settings; Documents by default.
- **Q3:** option 2. Staged research; usage credits only when the owner says so for a specific
  run.
- **Q4:** option 3, with a clarification from the owner: "Any book no matter the cost. Should
  use the best one. Money should not be a factor involved in the decision making." No free-first
  rule, no approval step for paid books.
- **Q5:** recommended. `add:` quick capture with zero tokens.
- **Q6:** recommended. Fixed events stay on Houston time.
- **"Reality check":** the owner redefined it: "There should be a reality check about if I
  complete the goal X could happen but not about if I could reach the goal. For example lets say
  I want to become an Olympian and have 4.5min mile it should create a plan to get me there give
  warnings about feasibility but ultimately make the plan. The real reality check should be if I
  win X competition would it help with goal Y." Applied as: plan for the goal as stated,
  feasibility warnings (never a lower target), and an impact check on every roadmap item.
- **Pitches P1–P9:** all declined. They are recorded in `docs/IDEAS.md`.

## Verification results

Checked 2026-10-02 against primary sources.

- **D1 — confirmed.** The headless docs (https://code.claude.com/docs/en/headless) still say
  `--bare` "will become the default for `-p` in a future release". They also say: "In bare mode,
  Claude Code never reads OAuth credentials or the system keychain". The CLI reference has no
  `--no-bare` flag yet, so the flag table in M9 stays the plan.
- **D2 — confirmed.** The docs give these minimum versions:
  - `--permission-prompts` requires v2.1.259
  - invalid `--json-schema` errors since v2.1.205
  - the Windows unreadable-stdin crash was fixed in v2.1.211
  - `--resume <id>` works from any directory since v2.1.223

  The minimum stays 2.1.259. Also: SIGTERM exits 143 and leaves the turn unfinished, and SIGINT
  ends the turn.
- **D3 — partly confirmed.**
  - Confirmed (headless docs): `stream-json` emits `system/api_retry` with `error: "rate_limit"`.
  - Confirmed (https://code.claude.com/docs/en/errors): the limit messages are
    - "You've hit your session limit · resets 3:45pm"
    - "… weekly limit · resets Mon 12:00am"
    - "… Opus limit …"
    - "… Sonnet limit …"
  - Model-specific limits therefore exist.
  - Not documented: the exact `-p --output-format json` shape of a limit hit.

  Kept as a single regex table, with the real shape recorded from a run (M1 spike / M9). Added
  the model-specific messages and the Opus→Sonnet fallback to ARCHITECTURE.
- **D4 — partly confirmed.**
  - `--setting-sources` exists: "Comma-separated list of setting sources to load (`user`,
    `project`, `local`)". The docs don't discuss its effect on login.
  - The docs confirm that `-p` without `--bare` runs a folder's hooks and `.mcp.json` servers
    "even in a folder you've never trusted".
  - New options found: `--safe-mode` disables CLAUDE.md, skills, plugins, hooks and MCP servers
    while "Authentication, model selection, built-in tools, and permissions work normally". There
    is also `--strict-mcp-config`.
  - **Adaptation:** the M1 spike now tests `--setting-sources user`. ARCHITECTURE lists
    `--setting-sources`, `--strict-mcp-config` and `--safe-mode` as candidates to test.
  - **New finding (support article "Use Claude Code with your Pro or Max plan"):** an
    `ANTHROPIC_API_KEY` in the environment takes precedence over the subscription and bills API
    usage. **Adaptation:** the runner strips it from the child environment (ARCHITECTURE, M9,
    CLAUDE.md).
- **D5 — not confirmed by an official page.**
  - Confirmed by the support articles: Pro has a 5-hour session limit and a weekly limit that
    "applies across all models". The weekly limit resets at a fixed time assigned to the
    account, and usage is shared between Claude and Claude Code.
  - Not confirmed: whether Opus is included on Pro in Claude Code. No official page says so.
    Third-party pages say it is in 2026.
  - **Adaptation:** model aliases stay configurable, and synthesis falls back to `sonnet`. The
    M1 spike now runs once with `--model opus`.
- **D6 — confirmed, with a watch item.**
  - The legal page (https://code.claude.com/docs/en/legal-and-compliance) says "Advertised usage
    limits for Pro and Max plans assume ordinary, individual usage of Claude Code and the Agent
    SDK". It also says that nothing in the restrictions prevents "an end user from signing in to
    the unmodified Claude Code binary with their own Claude subscription".
  - The restriction applies to developers routing *other users'* requests through plan
    credentials, which isn't this app.
  - Usage credits are available on Pro and apply to Claude Code. They are billed at API rates,
    are opt-in, and have a monthly cap (support article "Manage usage credits").
  - **Watch item:** the support article "Use the Claude Agent SDK with your Claude plan" says a
    change announced for `claude -p` / Agent SDK usage was paused on 2026-06-15. That change
    would have moved `-p` usage to a separate monthly credit ($20 on Pro). For now, "Claude Agent
    SDK, `claude -p`, and third-party app usage still draw from your subscription's usage
    limits."
  - Recorded in STATUS; re-check before M9.
- **D7 — confirmed.**
  - better-sqlite3 13.0.3 (the latest) depends on `node-addon-api` and has `gypfile: false`.
  - It has no install script, and the package contains `prebuilds/win32-x64.node` (plus other
    platforms).
  - 13.0.0–13.0.1 still ran `node-gyp rebuild`.
  - **Adaptation:** M1 requires ≥ 13.0.2. `npmRebuild: false` is correct.
- **D8 — confirmed.** Cloudflare's Workers limits page: cron triggers are allowed on the free
  plan (5 per account), with 100,000 requests/day and 10 ms CPU per request. D1 free: 5 million
  rows read/day, 100,000 rows written/day, 5 GB storage. A 1-minute cron uses 1,440
  invocations/day.
- **D9 — confirmed.** Telegram Bot API `setWebhook`: `secret_token` is "A secret token to be
  sent in a header 'X-Telegram-Bot-Api-Secret-Token' in every webhook request, 1-256
  characters."

## Apply log

- **C1 — applied.** `$13` → `$20` in `docs/prompts/README.md`.
- **C2 — adapted.** VISION rewritten from Fable's draft, with these changes:
  - book choice on quality alone, money never a factor (Q4)
  - the reality check replaced by "plan for the stated goal + feasibility warnings + impact
    check"
  - textbook progress, monthly checkpoints, sick-day mode and the pre-run estimate removed
    (pitches declined)
  - usage credits only per run when the owner says so (Q3)
  - a "Decisions log" added
- **C3 — adapted.**
  - ADR 0006: rules 2–4 rewritten for the owner's goal and impact rules; book policy changed to
    quality only; checkpoints removed.
  - ADR 0007: applied as written (Q6 recommended).
  - Both added to the ADR index.
- **C4 — adapted.** ARCHITECTURE rewritten from Fable's draft:
  - coach stages: the reality check was replaced by a roadmap stage with core feasibility math
    and an impact-check stage, and the checkpoint stage was dropped
  - data model: `targetLevel`, `cost`/`isFree` and `evidence[]` dropped; `Roadmap.feasibility`
    and `Milestone.impact` added
  - sick-day re-plan removed
  - Claude bridge: added `ANTHROPIC_API_KEY` stripping, the limit-message table, the Opus
    fallback, the usage-credits flow and the setting-isolation candidates (D3–D6); the pre-run
    estimate was removed
- **C5 — adapted.** ROADMAP from Fable's draft, with these changes:
  - M0 line updated
  - M1: better-sqlite3 ≥ 13.0.2; spike also tests `--model opus` and `--setting-sources`
  - M6: sick-day mode removed
  - M9: env stripping and usage-credits choice added
  - M11: reality check and estimate removed
  - M12: feasibility and impact-check items and AC added (the 4:30 mile fixture)
  - M15: "sick-day mode" wording removed
  - M16: checkpoint and hours-by-goal removed
- **C6 — adapted.** STATUS based on Fable's draft, plus:
  - session-2 summary and owner decisions
  - better-sqlite3 version gotcha
  - the hash-routing gotcha from the C8 smoke test
  - `ANTHROPIC_API_KEY` and the paused `-p` credit change as watch items
  - plain-language spike steps requested for the owner
- **C7 — adapted.** CLAUDE.md:
  - all five edits applied
  - the coach rule rewritten for the owner's answers (goal as stated, impact check, quality-only
    materials)
  - the Claude rule mentions stripping `ANTHROPIC_API_KEY`
- **C8–C12 — applied** earlier in this session from the owner's patch (`git apply`, identical to
  section 5). `pnpm check`, `pnpm build` and a headless Electron smoke test all passed.
- **C13 — applied.** Two rows added to IDEAS; the "Automatic roadmap re-planning" reason is
  reworded because P4 was declined. A "Declined in the first review" table records P1–P9.
- **Extra (missed by the review) — applied.** Stale milestone numbers updated:
  - placeholder pages: Grades M2, Tasks M3, Calendar M4–M5, Coach M11–M13, Reports M16,
    Settings M1+
  - the Coach page blurb no longer says "full college-style courses"
  - README coach blurb and relay milestone (M14)
  - the milestone pointer in ADR 0004 (decision unchanged)
