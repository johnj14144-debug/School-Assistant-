# 0009 — The timer lives in the database; main pushes change events

**Status:** Accepted (2026-10-03, M3)

## Context
The task timer has to survive restarts, crashes and (from M14) phone buttons pressed while
the laptop sleeps. It is controlled from several places at once: any page, the timer bar, the
command palette and the tray menu. Until M3 the renderer only *called* main (`invoke`), so a
change made from the tray could not reach an open page. Estimates (M7) need clean data: time
on two focus tasks at once would count the same minutes twice.

## Decision
- **A running timer is an open `time_session` row** (`end_at` null). There is no timer state in
  memory, so a restart (or a crash) keeps it running. Pause closes the session and stores the
  task in the `timer.paused` setting so Resume can pick it up.
- **One focus timer at a time.** Sessions of `focus`/`light` tasks never overlap; starting one
  closes the running one at the new start. `background` tasks (laundry) may overlap anything
  but their own sessions. The rules are pure functions in core (`tasks/sessions.ts`:
  `findConflict`, `planStart`, `planMoveStart`) and every write in `TimerService` goes through
  them, including typed-in and edited sessions.
- **"I started at…"** creates (or moves) a session start in the past. Moving the start of a
  running timer earlier also moves the end of the session it took over from (a late-pressed
  switch); explicit edits in the sessions table never change other sessions.
- **Completion is part of the task** (`status`, `completed_at`, `completion_note`, with a CHECK
  that `done` ⇔ `completed_at`), not a separate Completion table as first sketched.
- **Main → renderer events.** `shared/ipc.ts` declares `IpcEvents`; the preload exposes
  `window.api.on(event, listener)` for an allowlisted set of names. Task and timer services call
  an `onChange` callback after every write; main forwards it as `tasks:changed` to the window
  and refreshes the tray. Pages use `useLiveQuery`, which reloads on that event, so every view
  shows the database's state rather than a local copy.

## Consequences
- Timer state can't drift between the window, the tray and (later) the phone relay: there is
  one source of truth, and M14's phone events become session writes through the same rules.
- Every write reloads the views that listen; each load reads all tasks and sessions
  (`TaskSnapshot`). That is milliseconds at one student's scale; revisit if it ever shows.
- A laptop asleep with a timer running counts the sleep as work until M8 reacts to
  `powerMonitor`; the user can fix the session end by hand meanwhile.
