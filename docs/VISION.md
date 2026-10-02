# Vision

School Assistant is a personal app for one student: a University of Houston student who
treats school like a monastery. It runs on their Windows laptop, talks to their iPhone through
Telegram, and uses their Claude Pro plan for everything that needs judgment. It's meant to be
used every day for years, so it has to be reliable, fast, and easy to extend.

It has three parts: the **Planner**, the **Life Coach**, and **Grade Calc**.

This document is the product spec. It records what the user asked for and what was decided in
the first brainstorm (2026-10-02) and the first review (2026-10-02; owner answers under
[Decisions log](#decisions-log)). When a request conflicts with this document, ask the user.

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
| Ambition | The user sets the goal. The app builds the plan to reach **that** goal and warns honestly when it looks hard; it never waters the goal down. |
| Money | Not a factor in choosing books or materials. The best one is chosen, whatever it costs. |
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

**Job:** take a big goal, find out what it really takes, build the plan that gets the user
there, and break it down into smaller and smaller pieces until it's work on the calendar.

The coach is a **research-and-decomposition engine**, not a textbook author. It works in this
order for every goal, and the user approves each step before the next one runs:

1. **Where are you starting from?** An intake interview per goal: what the goal is and why, the
   deadline, hours per week (taken from the planner's real availability), current level with
   evidence ("what have you built / solved / read; what can you do right now"), materials the
   user already owns, constraints (schedule, hardware), and how the user likes to learn.
   Where self-assessment isn't enough, a short diagnostic (a placement quiz or a 30-minute
   exercise) sharpens the picture. Nothing else runs until this is done.

2. **Deep research.** Multi-stage, resumable across usage windows, cited. It establishes:
   - what the destination means in observable terms (for an exam: format, topics, pass mark,
     registration rules; for a skill: a ladder of levels from novice to expert, each with
     markers you can check, used to track progress);
   - the canonical curricula and the order people actually learn things in;
   - the **best textbooks and materials** per topic, each with a verified link. Quality is the
     only criterion: **price is never a factor** and paid books need no extra approval;
   - **projects** worth building, graded by difficulty; problem sets; **competitions** worth
     entering, with eligibility, dates and links;
   - how many hours people realistically need, with sources;
   - common ways people fail at this goal.
   The output is a research dossier the user can read, with a structured part the app uses.

3. **Roadmap for the goal the user set.** Phases → milestones. A milestone is one of: a
   **course** (textbook-driven), a **project**, a **competition**, an **assessment** (placement
   test, practice exam, the real exam), a **practice habit** (e.g. daily problems), or a
   **reading**. Each has hours, start and due dates, dependencies, and a "done when" check the
   user can verify. Skills get project-heavy roadmaps; exams get practice-heavy ones.
   - **The plan always targets the goal as the user stated it.** The coach never lowers the
     goal or asks the user to pick a smaller one.
   - **Feasibility warnings, not vetoes.** When the work the goal needs doesn't fit the hours
     available before the deadline, the coach says so plainly (with sources): the shortfall in
     hours, the projected finish date at the current weekly hours, and what would close the gap
     (e.g. more hours per week). Then it builds the full plan anyway. Example: "Become an
     Olympian with a 4:30 mile" gets a real training plan that leads there, plus a clear
     warning about how hard the timeline is.
   - **Impact check: does this help the goal?** Every roadmap item carries a sourced answer to
     "if I do / win this, how much does it help with the goal?" (e.g. "Would winning
     competition X help with goal Y?"). The coach only puts items in the roadmap that clearly
     help, says how, and flags weak ones. The user can ask the same question about anything
     ("should I enter competition X?") and get the same check.

4. **Courses, textbook-first.** A course wraps one or more textbooks: units map to chapters and
   sections, with exercise selections, projects and assessments. **The coach does not write
   lessons where a chosen textbook already covers the material.** It writes a lesson only for a
   marked gap (nothing good covers it, or the user said the book's explanation didn't work),
   and says why. Courses have placement tests, homework with due dates and answer keys,
   practice exams modeled on the real one, projects with rubrics, and a grading scheme, so they
   show up in Grade Calc like real courses.

5. **Down to tasks.** Units and projects become planner tasks with quantities (pages, problems,
   steps), estimates and due dates. Projects become task trees. Nothing is scheduled until the
   user approves the course.

6. **Learns as it goes.** Feedback after lessons, homework and exams updates the **teaching
   guide** and the upcoming units. The roadmap changes only when the user asks for it.

**Coach rules** (every coach prompt carries them):
- Estimates and recommendations cite sources. A book, course or competition without a verified
  link is marked unverified and never becomes a task on its own.
- Choose materials on quality alone; never consider price.
- Prefer existing excellent material over generated material. Prefer doing (projects, problems,
  competitions) over reading for skill goals.
- Build the plan for the user's goal. Warn about feasibility with numbers and sources; never
  shrink the goal.
- Every roadmap item must pass the impact check: it has to help the goal, and the coach says how.
- The user approves the dossier, the roadmap and each course before anything becomes work.

**Learns how to teach this user.** A "How I learn" page holds the user's own advice ("worked
examples before theory", "short lessons", etc.). The intake interview fills the gaps. The coach
keeps a concise, versioned **teaching guide** that every gap lesson, homework set and exam must
follow. The user can add notes any time (in the app, or by texting "coach: …") and attach their
own materials (textbooks, PDFs, links) to a goal.

**Weekly deep-research report**, run before the user's weekly usage reset (a setting; the
reset time is assigned per account): upcoming competitions and deadlines from the roadmaps, new
opportunities, ways to reach the big goals. Shown in the app and sent to the phone.

**Budget discipline.** Research runs in stages with the cheaper model gathering and the
stronger model synthesizing. When a run hits a plan limit it pauses and resumes after the
reset. The app never uses API keys. The only overflow allowed is Anthropic's own pay-as-you-go
**usage credits** on the subscription, and only when the user says so for a specific run
(credits are turned on and capped in the Claude account settings, never by the app).

---

## Grade Calc

- Enter every course, grading category (with weights) and assignment with its score.
- See all grades per course: **current grade**, **max possible grade** (100% on everything
  remaining), and min possible grade.
- Supports weighted-category and points-based courses, and per-course letter scales.
- Self-study courses from the Life Coach appear here too.
- **How grades are computed** (chosen in M1, the usual Canvas conventions; confirmed by the
  owner, Q7):
  - The current grade counts graded work only. Categories with nothing graded yet don't count.
  - Max assumes 100% on everything not yet graded; min assumes 0%. A category with no
    assignments entered yet (e.g. a final exam worth 25%) counts as wide open.
  - "Drop the lowest N" drops the scores that help the grade most, which is usually but not
    always the lowest percent (a 0/1 can matter less than a 50/100).
  - Extra credit: scoring above the points possible counts, and an assignment marked extra
    credit adds points without adding to the total. Ungraded extra credit is counted in the max
    (you could still earn it) but not in the min.
  - Grades aren't rounded before the letter is picked (89.99% is not an A-).

---

## Non-functional requirements

- **Standalone Windows app:** installer, tray icon, starts with Windows, keeps running in the
  tray when the window closes.
- **Claude through the user's subscription:** the app drives the user's own `claude` CLI. It
  never uses API keys or pay-per-token billing.
- **Extensible with Claude Code:** clear docs, a roadmap, small feature modules, tests.
- **Data safety from day one:** local SQLite database in WAL mode, a daily backup to a folder
  the user chooses in Settings (e.g. OneDrive; until one is picked, a folder in Documents; keep
  the last 14 days plus one per month), and a log file. Restore from a backup from inside the
  app.
- **Travel-safe:** see the time rule above.

---

## Decisions log

Owner answers to the first review (2026-10-02, `docs/reviews/2026-10-02-fable-review.md`):

| # | Question | Answer |
|---|---|---|
| Q1 | Build order of the big pieces | Planner core → Claude bridge → Life Coach → Phone |
| Q2 | Where daily backups go | A folder the user picks in Settings (e.g. OneDrive); default in Documents until then |
| Q3 | How hard research may lean on the plan | Staged (cheaper model gathers, stronger model synthesizes); usage credits only when the user says so for a specific run; never API keys |
| Q4 | Which textbooks | The best one, whatever it costs. Money is never a factor; no approval step for paid books |
| Q5 | Phone quick add without Claude | Yes: `add: …` becomes a task instantly, zero tokens |
| Q6 | Time zone when traveling | Fixed events keep their own zone (Houston by default); display follows the laptop |
| — | "Reality check" | Don't judge whether the goal is reachable or lower it. Build the plan for the stated goal with feasibility warnings. The real check is impact: "would winning X help with goal Y?" |
| — | Review pitches P1–P9 | All declined (see `docs/IDEAS.md`), including the pre-run usage estimate |
| Q7 | Grade rules chosen in M1 (see Grade Calc) | Confirmed: "The rules are good" (2026-10-02) |
