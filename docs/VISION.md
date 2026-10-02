# Vision

School Assistant is a personal app for one student: a University of Houston student who
treats school like a monastery. It runs on their Windows laptop, talks to their iPhone through
Telegram, and uses their Claude Pro plan for everything that needs judgment. It's meant to be
used every day for years, so it has to be reliable, fast, and easy to extend.

It has three parts: the **Planner**, the **Life Coach**, and **Grade Calc**.

This document is the product spec. It records what the user asked for and what was decided in
the first brainstorm (2026-10-02). When a request conflicts with this document, ask the user.

---

## The user and their constraints

| | |
|---|---|
| Computer | Windows **laptop** that sleeps and travels (not always on) |
| Phone | iPhone, using a **Telegram** bot (free, two-way, buttons, photos) |
| Claude | **Pro** plan. The user barely uses Claude otherwise, so the app may use nearly all of it. |
| School | University of Houston. Canvas can't be connected, so the user enters everything by hand. Syllabus import cuts the typing. |
| Sleep floor | **7.5 hours** a night, protected no matter what |
| Mode | "Student monk": everything outside sleep, meals and hygiene is available for school and goals, 7 days a week |
| Goals | Ace the Precalculus → Calculus 2 departmental exams; become an expert programmer within a year; more to come |
| Codebase | Built for the app, not as a learning project. Choose what is best for the app. |

---

## Planner

**Job:** time-block the whole week from deadlines, and keep the plan honest all day.

- Looks at the week's deadlines and **time-blocks the whole week** around fixed events (classes,
  sleep floor, meals).
- **Task timer:** start/stop every task. Each completed task records what it was plus a
  description. Assignments go inside tasks so the history is detailed. Supports pause, multiple
  sessions per task, and **"I started at…" backfill** if the user forgot to press start.
- **Learns durations** from timer history ("Calc HW: you take 1.4× your guess, ~7 min/problem")
  and uses them to size future blocks.
- **Re-plans live** when the user starts late, runs over, or finishes early.
- **Calendar** showing everything.
- **Breaks big tasks into smaller pieces**, but only when it helps. Not every task.
- **Concurrent tasks** ("laundry-style"): a task with waiting time is modeled as hands-on steps
  plus waits. The waits overlap focused work.
- **Syllabus import:** give it a syllabus PDF, a photo, or pasted text. Claude extracts the
  course, grade weights, assignments and due dates. The user reviews before anything is saved.
- **Phone:** reminders arrive on the iPhone even while the laptop sleeps. Buttons (▶ Start,
  ✅ Done, ⏰ +15, ⏭ Skip) work offline and keep their real timestamps. The user can text it in
  plain English ("move the essay to tomorrow, I'm sick") to add things or change the day.
- **Daily rhythm:** morning plan message, evening review, Sunday review.

**Design rule: the algorithm plans and Claude advises.** Scheduling and re-planning are
deterministic code: instant, free, predictable, testable. Claude handles the fuzzy parts:
understanding texts, breaking work down, reading syllabi, building courses, research.

---

## Life Coach

**Job:** turn big goals into real courses and keep the user on track.

- **Extremely deep research per goal.** It should spend a lot of tokens to understand what the
  goal really requires: exam format and topics, what "expert" means, the best free textbooks,
  canonical curricula, and what *this user* needs to do to get there. The output is a cited
  research dossier.
- **Builds full college-style courses** from that research. Not every goal is an exam; a goal can
  become one or several courses. Each course has:
  - objectives and a syllabus with a week-by-week schedule planned backward from the deadline
    and the weekly hours available
  - lectures and readings (e.g. OpenStax for math)
  - **homework assignments with due dates**, points and answer keys/solutions (revealed after
    submission)
  - **placement tests** at the start, to skip or compress what the user already knows
  - **practice exams**: timed, printable, modeled on the real exam. The user grades themselves
    and enters scores per question/topic.
  - projects where they fit (e.g. programming)
  - a grading scheme. Self-study courses show up in Grade Calc like real courses.
- **Learns how to teach this user.** A "How I learn" page holds the user's own advice ("worked
  examples before theory", "short lessons", etc.). An intake interview fills the gaps. The
  coach keeps a concise **teaching guide** that every lesson, homework set and exam must follow.
  The user can add notes any time (in the app, or by texting "coach: …") and attach their own
  materials (textbooks, PDFs, links) to a goal.
- **Feedback loop:** a quick rating and comment after each lesson or homework set ("too easy",
  "need more examples") updates the teaching guide and adapts the upcoming units.
- Course work flows into the **Planner** as tasks with real due dates.
- **Sunday deep-research report**, run before the weekly usage reset: competitions to join,
  things to do, ways to reach the big goals. Shown in the app and sent to the phone.

---

## Grade Calc

- Enter every course, grading category (with weights) and assignment with its score.
- See all grades per course: **current grade**, **max possible grade** (100% on everything
  remaining), and min possible grade.
- Supports weighted-category and points-based courses, and per-course letter scales.
- Self-study courses from the Life Coach appear here too.

---

## Non-functional requirements

- **Standalone Windows app:** installer, tray icon, starts with Windows, keeps running in the
  tray when the window closes.
- **Claude through the user's subscription:** the app drives the user's own `claude` CLI. It
  never uses API keys or pay-per-token billing.
- **Extensible with Claude Code:** clear docs, a roadmap, small feature modules, tests.
- **Data safety:** local SQLite database with daily backups to a folder the user chooses
  (e.g. OneDrive).
- **Travel-safe:** times are stored in UTC and shown in the laptop's current time zone.
