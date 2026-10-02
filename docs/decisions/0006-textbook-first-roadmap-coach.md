# 0006 — The coach researches, plans for the stated goal and decomposes; it doesn't author textbooks

**Status:** Accepted (2026-10-02)

## Context
The first draft of the Life Coach described it as a course author: full college-style courses
with generated lectures. The owner's actual requirement is different: start from where they
are, research deeply what a goal really takes, build a roadmap of textbooks, projects and
competitions that leads to the goal they set, and break it down until it's planner tasks.
Generated lecture notes are the most token-expensive output, the least reliable, and usually
worse than the canonical textbook on the topic. The app runs on a Pro plan with weekly caps.

The review proposed a "reality check" that names the level reachable by the deadline and has
the user pick a target. The owner rejected that: the coach must build the plan for the goal as
stated, warn about feasibility, and instead check whether each step actually helps the goal.

## Decision
The coach is a pipeline with user approval between stages:
intake (starting point) → research dossier → roadmap (with feasibility warning and impact
checks) → textbook-first courses → planner tasks.

Rules:
1. **Textbook-first.** A course unit must point at material (a textbook chapter/section range, a
   course, a problem set) or be explicitly marked as a *gap* with a reason. Lessons are
   generated only for gaps.
2. **The user's goal is the target.** The roadmap always leads to the goal as stated. The coach
   never lowers it or asks the user to choose a smaller one.
3. **Feasibility warnings, not vetoes.** Sourced hours needed are compared with real
   availability. If they don't fit before the deadline, the coach shows the shortfall, the
   projected finish date and what would close the gap, and still builds the full plan.
4. **Impact check.** Every roadmap item (course, project, competition, assessment, habit,
   reading) states, with sources, how it helps the goal ("would winning X help with goal Y?").
   Items that don't clearly help are left out or flagged. The user can ask the same question
   about any item.
5. **Verified or flagged.** Every recommended book, course or competition carries a link the
   research job actually fetched, or is marked unverified and can't become a task on its own.
6. **Quality over price.** Materials are chosen on quality alone; cost is never a factor and
   paid books need no separate approval (owner decision 2026-10-02).
7. **Decompose all the way.** Goal → phases → milestones → courses/projects → units → tasks with
   quantities and estimates. The planner schedules tasks; the coach never writes blocks.
8. **Nothing silent.** Dossier, roadmap and each course are approved by the user before work is
   created. The roadmap changes only when the user asks.
9. **Budget-aware.** Research is staged and resumable; the cheaper model gathers, the stronger
   one synthesizes. Usage credits are used only when the user says so for a specific run.

## Consequences
- Far fewer tokens per goal, spent on research and design instead of prose.
- New entities: GoalProfile, ResearchDossier (staged), Roadmap/Phase/Milestone (with an impact
  note), Material with locators, Unit.materialRefs, Competition fields; see ARCHITECTURE.
- Coach milestones are reordered: intake + research first, roadmap + courses second,
  assessments and gap lessons third.
- The teaching guide now governs gap lessons, homework and exams, not whole courses.
- No automatic roadmap checkpoints: progress is tracked, but changes wait for the user.
