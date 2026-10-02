# Session prompts

Ready-to-run prompts for specific Claude Code sessions. Each folder holds the system prompt, the
message, and any settings that session needs. `next-session.md` (written by the review session)
is the prompt for the next build session.

## 01 — Fable deep review ($13 of Console credits)

A one-time, unattended session that does five things:
- reviews the whole plan and codebase
- checks the plan's assumptions against current sources
- revises the docs
- makes the foundation sturdier
- writes `docs/prompts/next-session.md`, the prompt for the first build session afterwards

It runs on **Anthropic Console credits** with a hard cap of **$13**, using a Fable model. This
session doesn't use the Pro plan.

### Run it (Windows PowerShell)

1. Get the latest code. Merge PR #1 on GitHub once CI passes, then in your clone:

   ```powershell
   git switch main
   git pull
   pnpm install
   ```

2. Sign Claude Code in to your Console account (this switches it off your Pro login):

   ```powershell
   claude auth login --console
   ```

3. Start the run from the repo folder (one line):

   ```powershell
   claude -p "Read docs/prompts/01-fable-review/message.md and carry out that task exactly." --model claude-fable-5-1 --effort xhigh --max-budget-usd 13 --append-system-prompt-file docs/prompts/01-fable-review/system-prompt.md --settings docs/prompts/01-fable-review/settings.json --permission-mode acceptEdits --permission-prompts none
   ```

   It works quietly and prints a summary at the end, which can take a while. To watch progress,
   look at `git log review/plan-revision` in another window; it commits after every phase.

   - **Model:** `claude-fable-5-1` costs the same per token as Fable 5, but its cached reads are
     much cheaper, so $13 goes further in a long session. To use Fable 5 instead, swap in
     `--model claude-fable-5`.
   - **Effort:** `--effort xhigh` is deep but leaves budget for real work. `max` thinks harder
     per step but gets fewer steps done for $13.

4. **If it stops at the cap before finishing:** everything up to the last finished phase is
   already committed. Run this cheap wrap-up, which uses Sonnet and a fresh session so it
   doesn't pay to reload the long Fable conversation:

   ```powershell
   claude -p "The review session from docs/prompts/01-fable-review stopped at its budget cap. On branch review/plan-revision, read git log, docs/STATUS.md, docs/ROADMAP.md and docs/reviews/. If there are uncommitted changes, commit them only if pnpm check passes; otherwise leave them and say so in docs/STATUS.md. Then do only Phase 5 of docs/prompts/01-fable-review/message.md." --model sonnet --max-budget-usd 2 --settings docs/prompts/01-fable-review/settings.json --permission-mode acceptEdits --permission-prompts none
   ```

5. Switch Claude Code back to your Pro plan for everyday use (the app needs this later):

   ```powershell
   claude auth login
   ```

6. On GitHub, open a pull request from `review/plan-revision`, read
   `docs/reviews/2026-10-plan-review.md`, and decide on its pitches and questions. Then start the
   next session with `docs/prompts/next-session.md`.
