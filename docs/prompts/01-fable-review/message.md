# Task: review and improve School Assistant, then hand off

Start by reading `CLAUDE.md`, every file in `docs/`, and all source under `packages/` and
`apps/`. Then work through the phases below in order. At the end of each phase, commit with a
clear message and push.

## Phase 0: Orient and check the build on Windows

1. Create the working branch: `git switch -c review/plan-revision`.
2. Run `pnpm install`, `pnpm check` and `pnpm build`. This is the first time the project has run
   on the owner's real Windows machine. Fix anything that fails and note what you found.

## Phase 1: Verify the plan's assumptions

Check these against primary sources and keep the links for the review doc:

- **Claude Code headless mode** (`claude -p`). Does it still use the subscription login when run
  without `--bare`? Check `--json-schema`, `--resume` and how usage limits surface to a script.
  Also check Anthropic's current terms for scripting your own Claude Code for personal use.
- **Telegram Bot API**: inline keyboards, callback queries, webhooks, photo/file download, rate limits.
- **Cloudflare Workers free tier**: requests per day, cron triggers, D1 limits, secrets.
- **The pinned toolchain** (Electron, electron-vite, Vite, React, Tailwind, TypeScript 7, Biome,
  Vitest, pnpm). Are there newer stable releases or known problems? Is electron-vite 6 stable yet?
- **Data layer**: better-sqlite3 + Drizzle in a packaged Electron app on Windows, including
  running migrations at startup.
- **Calendar UI**: the FullCalendar license for the views we need, and good alternatives.
- **UH departmental exams** for Precalculus, Calculus 1 and Calculus 2: what they are (format,
  topics, scheduling, policies) and the best free materials for them.
- **"Expert programmer in a year"**: what a credible one-year path looks like, based on
  well-regarded free curricula.
- **Scheduling**: proven approaches to single-person time-blocking with deadlines and re-planning.
  Is a greedy least-slack scheduler enough, or is a JS constraint solver worth it?

## Phase 2: Critique

Write `docs/reviews/2026-10-plan-review.md` with these sections:

1. **Executive summary**: at most 10 lines, in plain words.
2. **Findings**, ranked by impact. Cover risks, gaps, contradictions, wrong assumptions,
   sequencing problems, over-engineering, and missing things the owner will need for daily use.
   For each finding, give what it is, why it matters, the evidence or link, and your recommendation.
3. **Pitches**: 5 to 10 new ideas worth considering, each with a one-line value statement and a
   rough cost. The owner will accept or reject them in the next session.
4. **Questions for the owner.**

## Phase 3: Revise the plan

Apply your recommendations to `docs/VISION.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`,
`docs/IDEAS.md` and the ADRs. Add new ADRs for new decisions, and supersede old ones rather than
rewriting them. Every milestone must be:

- small enough for one Claude Code session on a Pro plan,
- usable when finished,
- written with testable acceptance criteria and a short "how to verify" note.

Then write a first draft of `docs/prompts/next-session.md` (described in Phase 5).

## Phase 4: Improve the app

Make the highest-value improvements to the existing foundation that your review identified.
Examples:

- fixes for Windows problems from Phase 0
- Electron security hardening (navigation and permission guards, a CSP check)
- main-process error handling and a log file
- showing IPC errors in the UI
- a Playwright Electron smoke test wired into the `pnpm` scripts and CI
- groundwork that lowers risk for the next milestone

Stay within foundation scope and don't start the next milestone's features. For every change,
add tests, keep `pnpm check` and `pnpm build` green, and commit.

## Phase 5: Hand off

1. Finalize `docs/prompts/next-session.md`. It must be a complete, self-contained prompt for the
   **first build session after this review**: it sets the project up according to the revised
   plan, finishing any setup work this review identified but didn't do, and then builds the next
   milestone. Tell that session which docs to read, what to build, how to verify it, and how to
   hand off. Assume it runs on the owner's Claude Pro plan, either in Claude Code on the web or
   locally.
2. Update `docs/STATUS.md` (done / next / gotchas / open questions) and tick anything finished in
   `docs/ROADMAP.md`.
3. Commit, then run `git push -u origin review/plan-revision`.
4. End with a final message that contains a short summary of what changed, the path of the
   review doc, the branch name, and the full text of `docs/prompts/next-session.md`.
