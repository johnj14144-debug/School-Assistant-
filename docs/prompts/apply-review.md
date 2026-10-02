# Apply Fable's review

You're applying a review of this project written by Claude Fable on the owner's other account.
The review follows the format in `docs/prompts/fable-review.md`:
- a summary for the owner
- findings F#
- decisions for the owner Q#
- pitches P#
- a change list C#
- facts to double-check D#
- notes for you

**About the owner.** They have no coding experience. Talk to them in plain words, keep messages
short, and only ask about things that are truly theirs to decide. Read `CLAUDE.md` first. Its
rules apply to everything here, and the owner decides product questions.

## 1. Find the review and save it

- The owner attached the review or pasted it into their message. An attachment shows up as a
  file path, usually under `/root/.claude/uploads/`. If it came in several parts, join them in
  order.
- If you can't find it, ask the owner to attach `fable-review.md` with the attach (paperclip)
  button and send it again. Then stop.
- Save it unchanged as `docs/reviews/<today's date>-fable-review.md`, then commit.
- If it looks cut off, tell the owner in one line and work with what's there. Signs of that:
  a missing section, a change that stops mid-way, or an unanswered `[continued in next part]`.

## 2. Ask the owner first

Put the review's **Decisions for the owner** (section 3) and **Pitches** (section 4) to the owner
with AskUserQuestion:

- Rewrite each question in plain words, without code terms.
- Put Fable's recommended option first and mark it "(Recommended)".
- Ask pitches as multi-select ("Which of these ideas do you want?"), up to 4 per question.
- At most 4 questions per call. Repeat until everything is asked.

Record the answers:
- decisions go in `docs/VISION.md`, plus an ADR when one changes an architectural decision
- accepted pitches go in `docs/ROADMAP.md`
- rejected pitches go in `docs/IDEAS.md`, with the owner's reason

## 3. Double-check the facts

For each item in section 6 (D#), check primary sources with web search. Note what you found
under a new heading, "Verification results", at the end of the saved review. If a fact turns
out wrong, adjust the changes that rely on it.

## 4. Apply the change list

Work through section 5 (C#) in order:

- **Skip** a change if it depends on a decision the owner answered differently, or on a pitch
  they rejected.
- **Treat Fable's text and code as a strong draft, not gospel.** If a Find text doesn't match
  the file exactly, find the intended spot and apply the change in spirit.
- **Fix anything that doesn't compile,** breaks a rule in `CLAUDE.md`, or contradicts an
  accepted ADR. A change that would override an owner decision needs the owner's yes first.
- **Test as you go.** Add or adjust tests for any behavior you change. After each logical group
  of changes, run `pnpm check` and `pnpm build`, then commit with a message that names the IDs
  (for example "Apply C3–C5: harden Electron window").
- **Keep an apply log** under a heading "Apply log" at the end of the saved review. Give one line
  per change: applied, adapted (how) or skipped (why).

If you're running low on time or usage, stop at a clean point. Commit and push, then list the
remaining C# items under "Next session" in `docs/STATUS.md`. Tell the owner to start a new
session and send: `Continue applying the Fable review (see docs/STATUS.md).`

## 5. Finish

1. Update `docs/STATUS.md` (done / next / gotchas / open questions) and tick or reshape
   `docs/ROADMAP.md` to match what you applied.
2. Push your branch, open a draft pull request titled "Apply Fable review", and get CI green.
   Fix failures until it passes.
3. Ask the owner with AskUserQuestion whether to merge it now. Offer "Merge it now
   (Recommended)" and "Not yet". If they say yes, mark the PR ready and merge it once CI is green.
4. End with a short plain-words message:
   - what changed, in about 5 bullet points
   - anything you skipped, and why
   - the next step: start a new session and send `Continue the roadmap.`
