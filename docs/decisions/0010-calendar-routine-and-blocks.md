# 0010 — Calendar: RRULE subset, an Intl zone helper, a protected sleep floor, FullCalendar 7

**Status:** Accepted (2026-10-03, M4)

## Context
M4 adds the routine (classes, sleep, meals, hygiene, anything else that repeats) and blocks of
planned time. ADR 0007 already says recurring events are wall-clock time in an IANA zone and
expand in core, with `Temporal` if the runtime has it. Node 22, which runs the tests, has no
`Temporal`. The sleep floor (7.5 h) is "protected no matter what", but a fixed 23:00–06:30
sleep is only 6.5 real hours on the night the clocks spring forward. The roadmap names
FullCalendar for the week and day views; its current major version is 7.

## Decision
- **Zone math** (`core/time/zone.ts`): `toZoned`, `fromZoned`, `zoneOffsetMinutes` and
  `startOfZonedDay` built on a cached `Intl.DateTimeFormat` per zone. `fromZoned` follows
  Temporal's `compatible` rule: a time skipped in March moves later by the gap, a time that
  happens twice in November takes the first. Replace it with `Temporal` once both Node (tests)
  and Electron have it; the function signatures stay.
- **Recurrence** (`core/time/recurrence.ts`): RRULE text in the database, limited to what a
  weekly routine needs: `FREQ=DAILY|WEEKLY`, `INTERVAL`, `BYDAY` (plain weekdays; a filter for
  DAILY), `UNTIL` (a local date, inclusive) and `COUNT`; weeks start on Monday. Anything else is
  rejected with a message, so stored rules always expand. DTSTART is the event's `startDate`.
  Skipped occurrences are a JSON list of local dates on the event (`exceptions`).
- **Sleep floor in code:** a sleep event shorter than the floor (wall clock) can't be saved;
  sleep occurrences can't be skipped; an event that becomes sleep loses its skipped dates; and
  expansion lengthens any sleep occurrence shorter than the floor in real time *at the end*
  (wake an hour later on the March night), reporting `extendedMin` so the calendar can say why.
  The floor is the `calendar.sleepFloorMin` setting (default 450, can only go up). Nights from
  today on with no sleep in the routine are listed so the calendar can warn.
- **Blocks** are UTC instants with `source` (`manual` now, `planner` from M5), `locked` (M6's
  re-planner never moves it) and `reason`. Rules in core (`calendar/rules.ts`), enforced on
  every create and move: nothing overlaps sleep; a focus/light block (or one without a task)
  overlaps no fixed event and no other such block; a background block (laundry) may overlap
  meals, routine items and other blocks, but not sleep, classes or `other` commitments such as
  tutoring or a chapter meeting, where the owner is away (owner decision Q10). A conflict that appears later (a class added over a block) is shown on the block, not
  fixed silently. Deleting a task deletes its blocks.
- **Calendar UI:** FullCalendar 7 (`@fullcalendar/react` with its timegrid and interaction
  plugins and the breezy theme, indigo palette), which needs `temporal-polyfill` as a peer.
  The calendar shows times in the laptop's zone (`timeZone: 'local'`). Events come from
  `calendar:range`; drags and drops call IPC and snap back when main refuses, so the database
  stays the only source of truth. A new `calendar:changed` event reloads every live view.

## Consequences
- The scheduler (M5) gets availability from `availability()` (window minus every fixed event,
  sleep with its floor) and must treat locked blocks as busy; it inherits the overlap rules.
- Rules from other calendars (monthly, BYSETPOS, numbered BYDAY) can't be stored. If the owner
  ever imports an `.ics`, extend `parseRRule` rather than storing raw text.
- FullCalendar 7 makes the renderer bundle bigger (about 1.8 MB in all after M4; it loads from
  disk, so the cost is startup parse time only). Its theme CSS uses hashed class names; app
  overrides in `styles.css` target only our own `sa-*` classes and its CSS variables.
