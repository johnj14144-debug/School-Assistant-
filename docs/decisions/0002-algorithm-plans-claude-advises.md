# 0002 — Deterministic scheduler; Claude only for fuzzy work

**Status:** Accepted (2026-10-02)

## Context
The planner re-plans many times a day: on a late start, an overrun, an early finish, or any
edit. The user is on Claude Pro, which has 5-hour and weekly usage limits. An LLM is slow,
costly and inconsistent at arithmetic packing problems.

## Decision
Time-blocking and re-planning are **deterministic code** in `packages/core/src/scheduler`.
Claude handles tasks that need understanding: parsing phone texts into intents, breaking down
tasks, syllabus import, goal research, course and content generation, reports.

## Consequences
- Re-planning is instant, free, predictable and testable with property-based tests.
- Usage budget is saved for the work only Claude can do (deep research, courses).
- The scheduler must explain itself (a `reason` on each block), since there is no LLM narrative.
