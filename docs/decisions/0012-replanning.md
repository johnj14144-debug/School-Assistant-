# 0012 — Re-planning: keep what still works, fill the rest, fall back for deadlines

**Status:** Accepted (2026-10-03, M6)

## Context
M5's "Plan my week" makes a fresh plan every time, so running it again can move every block.
M6 makes the plan follow the day: overruns, finishing early (owner decision Q12: re-pack the
rest of the day), task edits, and a manual "Re-plan now"; a late start only reminds (Q13: after
a 10-minute grace, nothing moves until "Re-plan now"). The roadmap asks for minimal moves
("after a 30-minute late start, Re-plan now moves only what it must"), with past and
in-progress work frozen and locked blocks respected. ADR 0002 still holds: deterministic code.

## Decision
- **Keep, then fill** (`replan` in `core/scheduler/plan.ts`). The planner's own unlocked blocks
  that haven't started are *previous* blocks. A previous block stays (sticky) when it is still on
  the grid and free (nothing new overlaps it, its breaks are kept), its task still needs the
  work, and it respects the task's earliest start and hard due date. A task keeps its focus
  blocks in time order up to its work left; the last kept block may be shortened, and what's
  left to plan anew is never less than the task's minimum chunk. A laundry-style sequence stays
  only whole and exactly where it was. Everything else is placed by M5's passes in the time
  left, so a re-plan never moves a kept block to make room.
- **Deadlines beat stickiness.** If the sticky plan misses more hard work (or, tied, is later on
  soft deadlines) than a fresh plan, it frees every previous block that starts before the last
  due date in trouble and tries again (`partial`); if that's still worse, the fresh plan wins
  (`full`). The run records which (`fallback`).
- **Frozen:** blocks placed or moved by hand, locked blocks, and blocks under way. A block under
  way whose focus task isn't being timed is *missed* (a late start): automatic re-plans leave it
  (Q13); "Re-plan now" releases it (trimmed to now if its task was worked on during it, else
  removed) and its task gets the first free time it fits, cut to fit before the next kept block
  if needed (`startNowTaskId`). A laundry run with any frozen block stays whole.
- **Finishing early** (task done, or the timer stopped; not paused) ends the task's work blocks
  under way at that moment, then re-plans with `repackUntil` = midnight: previous blocks before
  then lose their place and are placed again as early as they fit (ASAP order), later days stay
  sticky. Work that just ended (within the break) earns its break, so the next block starts after
  it.
- **Overruns:** a one-minute tick in main. If the focus timer's task has no block covering now and
  one of its blocks ended while the timer ran, that block grows to 15 minutes past now (on the
  5-minute grid), never into a routine item or a block that stays; then the plan re-plans around
  it, so what it runs into moves.
- **Triggers:** task, timer and calendar services report `edit` or `finish` events to
  `PlannerService.notify`; it acts only when a plan exists (`planner.lastRun`), trims at once,
  and re-plans once changes settle (1 s; a finish makes the waiting re-plan a re-pack). "Plan my
  week", "Re-plan now" and "Clear plan" cancel a waiting re-plan. The planner writes blocks
  directly, so its own writes never trigger it.
- **Same rows:** kept blocks keep their ids (a shortened one is updated); a new block identical
  to a released one reuses its row. No migration was needed (the planned `block.planVersion`
  was dropped).
- **Reporting:** `diffPlans` gives per task `moved` / `added` / `removed` with the first block
  that went and came; `planner.lastRun` gains `trigger`, `fallback` and `changes` (with defaults,
  so M5's stored run stays valid). Main pushes `planner:replanned`; the renderer shows a toast
  (an automatic re-plan that changed nothing shows none). `behindPlan` finds the planned work
  block under way, unworked for the grace, counting from its start or from when work on its task
  stopped during it; Today shows it with "Re-plan now".

## Consequences
- Re-planning is cheap (about 1.5 ms for the realistic week, about 4 ms when it falls back and
  plans three times), so every change can re-plan without a worker.
- Stability is tested with fast-check: after any change every rule still holds; with nothing
  changed the whole plan stays; after a late start "Re-plan now" moves only the late task (new
  blocks only for the late task or work that didn't fit before); an overrun leaves every focus
  task clear of it in place; re-packing keeps every focus block after the window. A 15× sweep
  (about 22,500 runs) found nothing.
- Keep-then-fill favors stability over the best packing: a block that loses its place goes to
  the next gap where it fits instead of shifting its neighbours, and a re-packed day can differ
  in order from the first plan. A fresh plan is one click away ("Plan my week").
- Previous blocks off the 5-minute grid are released (the planner never makes them; only edits
  to the database could).
