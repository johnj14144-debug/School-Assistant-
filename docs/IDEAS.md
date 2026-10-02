# Ideas backlog

Ideas from brainstorms that aren't on the roadmap yet. When one gets picked, move it into
ROADMAP.md as a milestone or checklist item. Note who suggested it and why it's parked.

| Idea | What it would do | Why parked |
|---|---|---|
| iPhone Calendar feed | The relay serves a private ICS URL; time blocks show in the iPhone Calendar app and widgets even while the laptop sleeps | Not picked in the first brainstorm; cheap to add after the relay (M14) |
| Grades steer priorities | Courses at risk of dropping a letter get more planner time; "What do I need on the final for an A?" | Not picked; the "what do I need" calculator could join Grade Calc any time |
| Daily flashcards (FSRS) | Short spaced-repetition review block built from formulas and past mistakes | Not picked; strong fit for the math exams later |
| One-tap "add to plan" | Competitions in the Sunday report come with a button that adds their deadlines as tasks | Not picked |
| Photo grading | Snap handwritten work; Claude grades it with feedback | User prefers to enter grades themselves |
| Energy-aware scheduling | Put the hardest work in the hours when the timer shows the user is fastest | Needs a few weeks of timer data first (after M5) |
| UH Canvas calendar feed | Try the personal "Calendar Feed" link in Canvas → Calendar to import due dates automatically | User says UH blocks easy connections; worth one quick test |
| Cloud-run Sunday research | Run the weekly research as a Claude Code cloud routine so it works while the laptop sleeps, then sync results | Adds moving parts; revisit if the laptop is often asleep on Sundays |
| MCP server for the app | Expose tasks/plan/grades as MCP tools so an interactive Claude Code session can query and change the plan | Nice for power use; after M9 |
| Focus nudges | If a block isn't started within 10 min, ping the phone and offer to re-plan | Natural follow-up to the relay (M14) |
| Streaks & scoreboard | Deep-work hours per day, plan adherence %, streaks | After M5 has data |
| Generated lecture notes for whole courses | Claude writes the lessons for every unit | Replaced by textbook-first courses (ADR 0006); lessons are generated only for justified gaps |
| Automatic roadmap re-planning | The coach changes the roadmap on its own when progress slips | Rejected in the review: the roadmap changes only when the user asks (ADR 0006) |

### Declined in the first review (2026-10-02)

The owner declined all nine pitches from `docs/reviews/2026-10-02-fable-review.md`. Don't add
them back without asking.

| Pitch | What it would do | Owner's reason |
|---|---|---|
| P1 Reality-check card | Each goal shows the level reachable by the deadline and when higher levels land | The coach must plan for the goal as stated and only warn about feasibility. The useful check is impact: "would winning X help with goal Y?" (now in M12) |
| P2 Textbook progress bars | Pages/chapters done per book on the goal page and in Grade Calc | Declined |
| P3 Evidence locker | Attach projects, competition results and exam scores to milestones as a portfolio | Declined |
| P4 Roadmap checkpoint | Monthly comparison of progress vs. plan with proposed roadmap changes | Declined; the roadmap changes only when the user asks |
| P5 "Does this fit?" dry run | Before accepting a course or roadmap, show whether the week still fits | Declined |
| P6 Usage forecast | Before a research run, estimate turns, 5-hour windows and queue | Declined, including the plain pre-run estimate |
| P7 Markdown export | Everything as an Obsidian-compatible folder, as a second backup | Declined |
| P8 Sick-day / travel mode | One tap collapses today to essentials, silences reminders, re-plans tomorrow | Declined (texting "I'm sick today" in M15 still moves the day's work) |
| P9 Hours-by-goal weekly view | Where the week's hours went, per course/goal | Declined |
