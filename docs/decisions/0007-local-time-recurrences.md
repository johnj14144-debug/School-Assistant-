# 0007 — Instants in UTC; recurring fixed events in local time + IANA zone

**Status:** Accepted (2026-10-02)

## Context
The first spec said "times are stored in UTC". That is right for moments that happened (timer
sessions, completions, placed blocks) but wrong for recurring fixed events. A class "MWF 10:00
America/Chicago" stored as UTC moves by an hour at every daylight-saving change, and the sleep
floor would drift when the laptop travels. The calendar milestone's acceptance criterion tests
exactly this.

## Decision
- **Instants** (TimeSession, Completion, Block start/end, Assignment dueAt, Task dueAt) are UTC
  ISO strings.
- **Recurring fixed events** store `startLocal` ("10:00"), `endLocal`, an RFC 5545 recurrence
  rule, and an IANA `timeZone`. The default zone is **America/Chicago** (Houston; owner
  decision Q6) and does not follow the laptop. Expansion to concrete instants happens in
  `packages/core` with the zone passed in, using `Temporal` if available in the runtime or a
  small date-fns-tz style helper otherwise; never `Date` arithmetic on local time.
- **Display** always uses the laptop's current zone.
- Durations are minutes everywhere.

## Consequences
- The scheduler receives availability already expanded to UTC instants for the planning window.
- Tests must include a DST transition week (second Sunday of March, first Sunday of November).
- CLAUDE.md's time rule is updated to match.
