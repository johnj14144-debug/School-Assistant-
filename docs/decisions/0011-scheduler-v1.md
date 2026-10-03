# 0011 — Scheduler v1: earliest deadline first on a 5-minute grid, steps first, fallbacks

**Status:** Accepted (2026-10-03, M5)

## Context
M5 adds "Plan my week": time-block the next seven days from the tasks' due dates and
estimates, around the routine (ADR 0010), with chunking, breaks, subject interleaving,
laundry-style tasks and warnings when work can't fit. ADR 0002 says this is deterministic code.
The acceptance bar is a realistic week (5 courses, 25 tasks) in under a second, no overlapping
focus blocks, nothing in sleep, and every feasible deadline met. Packing work with minimum block
lengths and breaks is NP-hard in general, so "every feasible deadline" needs a practical
meaning and a fallback.

## Decision
- **A 5-minute slot grid** from now (rounded up) to midnight after the seventh day, in the
  laptop's zone (`core/scheduler/grid.ts`). Each slot carries flags: `HARD` (sleep, class,
  other commitment), `SOFT` (meal, routine item), `WORK` (focus/light work, kept or planned)
  and `BUSY` (anything else that needs the user: a hands-on step, a block without a task).
- **Sequences first.** Tasks with steps (laundry) and background tasks are placed before focus
  work: a hands-on step needs a free slot run; a wait (or a background task's single block)
  may overlap anything but `HARD`; a step after a wait starts within 30 minutes of its end.
  Each takes the first local day where the whole sequence fits, at the start that leaves the
  fewest free slots right beside its steps (so steps sit next to meals and classes and free
  time stays in one piece).
- **Focus work forward in time, earliest deadline first** (`placeFocus`). At each free gap the
  earliest-due task that fits goes in (ties: priority, then age); undated work comes after all
  dated work. Chunks are at most `planner.maxChunkMin` (90) and at least the task's
  `minChunkMin` (30), never leave a remainder shorter than that, and a work block is followed
  by `planner.breakMin` (10) before the next one, including blocks the user placed. Work that
  fits in one block is not cut up to fill a short gap unless its deadline is tight.
  - **Interleaving:** if the next chunk would be the same subject (course, or task tree) as the
    last, the first other-subject task goes instead when a demand check passes: for every
    deadline before it, 75% of the free time from after the swapped chunk to that deadline
    still covers all work due by then.
  - **One sitting:** a non-splittable task takes a gap long enough for it when no later gap
    before its due date would do.
  - **The running task** keeps the first block if it has work left.
- **Fallbacks:** if any work misses its due date, the focus pass is rerun without interleaving,
  then also without the one-sitting and running-task preferences; the run with the fewest
  missing minutes wins. So interleaving never costs a deadline that plain EDF meets.
- **Honest output.** Every block has a "why here" reason; work that can't fit before its due
  date (or is overdue, or fits nowhere) becomes a warning with options: plan the rest after the
  due date (the task's `allowLate`), let it be split, edit the task. Tasks without an estimate
  or with the estimate used up are listed, not guessed.
- **What a run replaces:** only the planner's own unlocked blocks that haven't started. Manual
  and locked blocks and blocks under way stay and count as planned time for their task. A
  planner block the user drags becomes manual. Re-planning on events and stickiness are M6.
- **Storage:** tasks gain `earliest_start_at`, `splittable`, `min_chunk_min`, `allow_late` and
  `steps` (JSON); blocks gain `kind` (`work`/`step`/`wait`). They are plain `ALTER TABLE ADD`
  columns without CHECKs (zod validates writes), appended at the end of each table, so
  migration 0004 doesn't rebuild the task table. `isBackgroundBlock(kind, attention)` decides
  overlap rules for every block. The last run's summary and warnings are the
  `planner.lastRun` setting.
- **Tested with fast-check:** for random weeks (routine subsets, kept blocks, up to 14 tasks of
  every kind, random settings, across the November change) every plan keeps the rules (grid,
  no hands-on overlap, nothing in sleep/class/other, breaks, chunk sizes, earliest starts, due
  dates, steps in order); and whenever the work due by each deadline is at most 40% of the free
  time before it (minus what chunking can lose per gap), no deadline is missed.

## Consequences
- A realistic week plans in about 2 ms, so M6 can re-plan on every event without a worker.
- "Meets every feasible deadline" is guaranteed only up to the property's margin; tighter weeks
  can still show a shortfall warning that a cleverer packing would avoid. The warning names the
  minutes and offers ways out, so the user always knows.
- Placement is as early as possible (ASAP), so a light week is front-loaded and leaves later
  days free; undated tasks fill the remaining free time. Both are owner choices to confirm
  (Q11 in VISION).
- Partial progress inside a task with steps isn't tracked: a re-run plans all its steps again
  unless one of its blocks is kept.
