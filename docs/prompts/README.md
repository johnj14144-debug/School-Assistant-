# Session prompts

## Fable review (one time)

Fable, on your other Claude account, reads the whole project and writes **one file** listing
every change and fix it suggests. Then a Claude Code session here applies them for you.

### Step 1: Get the kit

Download **`fable-review-kit.md`**. Claude sent it to you in the chat. It holds Fable's
instructions plus the whole project in one file.

To make a fresh one later, start a session here and ask: `Make me a new Fable kit.`

### Step 2: Give it to Fable

1. Open your other Claude account in your web browser and start a **new chat with Fable**.
2. Attach `fable-review-kit.md` with the attach (paperclip) button. If there's no attach
   button, open the file, select all, copy, and paste it in.
3. Send:

   ```text
   Follow the instructions at the top of the attached file.
   ```

4. If you see a setting for maximum length ("max tokens"), set it to the highest number.
5. If Fable stops before it's finished, reply `continue`.

**Optional second pass.** This uses more of your $20 and catches Fable's own mistakes. When
Fable is done, send:

```text
Now act as a strict second reviewer of your fable-review.md. Check every change against the project files for mistakes or missing pieces, then give me the complete corrected fable-review.md.
```

Then use the newer file in step 3.

### Step 3: Save Fable's answer

Download the file Fable made, **`fable-review.md`**. If it didn't make a file, copy its whole
answer instead.

### Step 4: Let Claude Code apply it

1. Here in Claude Code, start a **new session** on School-Assistant-.
2. Attach `fable-review.md`, or paste Fable's answer.
3. Send:

   ```text
   Apply the attached Fable review by following docs/prompts/apply-review.md.
   ```

4. Answer its multiple-choice questions. It does the rest and tells you when it's done.

## Files here

| File | What it is |
|---|---|
| [fable-review.md](fable-review.md) | Prompt 1: Fable's instructions (the top of the kit) |
| [apply-review.md](apply-review.md) | Prompt 2: instructions for the Claude Code session that applies Fable's review |

The kit is built by `scripts/make-fable-kit.mjs` (`pnpm fable-kit`).
