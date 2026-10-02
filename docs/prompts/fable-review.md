# Instructions for Fable: review School Assistant and propose every fix

You're doing a one-time deep review of a young software project for its owner. Below these
instructions is **the entire project**, one file per `<file path="…">` block, taken from a
private GitHub repository. Nothing else exists yet (the lockfile and images are left out).

Your job is to find what's wrong, weak, missing or risky, and to design the fixes. Write
everything into **one Markdown document, `fable-review.md`**, in the format at the end of these
instructions. The owner will hand that document to a Claude Code session that has the real
repo, can run the tests and search the web, and will ask the owner about anything that needs
their decision. You can't run code or change the repo, so your proposals have to be precise
enough to apply without guessing.

## The owner and the project

- The owner is a University of Houston student. They will use this app **every day for
  years** to run their life as a "student monk": school and self-study, nearly every waking
  hour, with a protected 7.5-hour sleep floor.
- They have **no coding experience**. They won't edit code by hand. Future Claude Code
  sessions, mostly on their Claude Pro plan, will build the app one milestone at a time,
  following `CLAUDE.md`, `docs/STATUS.md` and `docs/ROADMAP.md`. **Those docs are instructions
  for future AI sessions**, so their clarity and correctness matter as much as the code.
- The product spec is `docs/VISION.md`, the design is `docs/ARCHITECTURE.md`, and the reasons
  behind big choices are the ADRs in `docs/decisions/`.
- **Current state:** milestone M0, the foundation, is done (an Electron + React shell with
  typed IPC, a first tested core module, CI on Ubuntu and Windows). M1 is next. Today is
  2026-10-02.

## Ground rules

- The owner's decisions stand. These are the section "The user and their constraints" in
  `docs/VISION.md` and the accepted ADRs. If you think one is wrong, don't quietly change it.
  Make your case under **Decisions for the owner**, with options and a recommendation.
- Ideas they already parked are in `docs/IDEAS.md`, with reasons. Re-pitch one only if you
  have a new argument.
- Don't build features from M1 onward. You may reshape the roadmap, improve the docs, and
  improve the M0 foundation code.
- Your knowledge has a cutoff. For anything time-sensitive (library versions, API limits,
  free tiers, prices, policies, UH exam details), say what you believe and list it under
  **Double-check online** rather than stating it as fact.
- The owner is paying for this review, so put the depth where it matters most for a tool used
  daily for years. Fewer, high-value changes done properly beat many shallow ones.

## What to review

Cover whatever deserves attention, including at least:

1. **Product fit.** Will this plan produce something a student monk actually uses every day?
   What's missing for daily use, what's over-built, and what would make them stop using it?
2. **Roadmap.** Is the order right? Does each milestone fit **one Claude Code session on a
   Pro plan**, leave the app usable, and have testable acceptance criteria? Is anything
   risky scheduled too late?
3. **Architecture and data model.** These cover the scheduler and estimator design, the
   Claude bridge (the app scripts the owner's own `claude` CLI on their subscription, so
   usage limits apply), the Telegram relay (the laptop sleeps and travels), time zones,
   backups and data safety, privacy and security.
4. **Docs as instructions.** Are `CLAUDE.md`, `STATUS.md` and `ROADMAP.md` clear,
   consistent and complete enough for a fresh AI session to do the right thing without
   asking? Look for contradictions between files.
5. **Code and tooling.** Look for bugs, Windows-specific problems, Electron security
   (navigation, permissions, CSP), error handling and logging, the IPC design, tests, CI, and
   the build and installer config.

## Output: `fable-review.md`

If you can create files, create one downloadable file named `fable-review.md`. Otherwise,
write the document as your reply.

If it doesn't fit in one reply, stop after a complete item and write `[continued in next
part]` on its own line. When the owner replies `continue`, carry on from the next item
without repeating anything. The applying session will join the parts.

Use exactly these sections and ID styles:

```text
# Fable review: School Assistant

## 1. Summary for the owner
At most 15 lines. Plain words, no jargon: what's good, what's most important to fix, and
what changes for them.

## 2. Findings
F1, F2, … ranked by impact. Each: severity (high / medium / low), what it is, why it matters,
your recommendation, your confidence.

## 3. Decisions for the owner
Q1, Q2, … Each: a short question in plain words, 2–4 options with your recommended option
first marked "(Recommended)", and one line on what changes depending on the answer.
The applying session will ask these as multiple-choice questions.

## 4. Pitches
P1, P2, … 5–10 new ideas. Each: one-line value to the owner, rough size (S / M / L), where it
fits in the roadmap.

## 5. Change list
C1, C2, … in the order they should be applied (see format below).

## 6. Double-check online
D1, D2, … Each: the claim, what to check and where, and what to do depending on the answer.

## 7. Notes for the applying session
Order, risks, dependencies between changes, anything to watch out for.
```

### Change list format

Each change is self-contained and names its reasons:

```text
### C3: <short title>
- Why: F2, P1
- Needs owner decision: none | Q4 (apply only if the owner picks option …)
- Verify: how the applying session can check it worked
```

Then one or more operations. Use `~~~` fences, not backticks, so the project's own
Markdown fences don't break them.

- **Edit part of a file.** Copy the Find text exactly from the project files. Keep it long
  enough to be unique, and make the replacement complete.

  ```text
  #### Edit `docs/ROADMAP.md`
  Find:
  ~~~text
  <exact current text>
  ~~~
  Replace with:
  ~~~text
  <new text>
  ~~~
  ```

- **Create a new file, or rewrite a file that changes a lot.**

  ```text
  #### Write `apps/desktop/src/main/log.ts`
  ~~~ts
  <complete file content>
  ~~~
  ```

- **Remove a file.**

  ```text
  #### Delete `docs/some-old-file.md`
  ```

Rules for changes:

- Never elide anything in a replacement: no `...`, no "rest unchanged". Partial text gets
  applied literally.
- Code must follow `CLAUDE.md`: TypeScript strict, Biome style (2 spaces, single quotes,
  100 columns), tests next to the code as `*.test.ts`, pure logic in `packages/core`, and no
  `Date.now()` inside core functions.
- When a change adds or changes behavior, include its tests in the same change.
- Keep the docs consistent. If a change touches the roadmap, update STATUS and the ADRs in
  the same change or a following one. A new architectural decision gets a new ADR, plus a
  row in `docs/decisions/README.md`.
