import { z } from 'zod';
import { formatMinutes, parseDuration } from './duration';

/**
 * Laundry-style tasks (M5): hands-on steps and waits. The planner gives each hands-on step its
 * own short block and lets the waits run alongside other work, like a background task.
 *
 * Typed as one line: "Load the washer 5m, wait 45m, Move to the dryer 5m, wait 1h dryer, Fold
 * 15m". An item starting with "wait" is a wait; the words after its duration name it.
 */

export const taskStepSchema = z.object({
  /** "Load the washer"; a wait's name ("dryer") may be empty. */
  title: z.string().trim().max(80),
  minutes: z.number().int().min(1).max(1440),
  /** Waiting (the washer running): the user is free for other work. */
  wait: z.boolean(),
});
export type TaskStep = z.infer<typeof taskStepSchema>;

export const MAX_STEPS = 20;
export const taskStepsSchema = z.array(taskStepSchema).max(MAX_STEPS);

const DURATION =
  /(\d+(?:\.\d+)?\s*h(?:ours?|rs?)?(?:\s*\d+\s*m(?:in(?:ute)?s?)?)?|\d+(?:\.\d+)?\s*m(?:in(?:ute)?s?)?|\d+:[0-5]\d)(?![\w:])/i;
const WAIT = /^wait(?:ing)?\b\s*(?:for\s+)?/i;

export type ParsedSteps = { ok: true; steps: TaskStep[] } | { ok: false; error: string };

/** Steps from text; blank text is no steps. */
export function parseSteps(text: string): ParsedSteps {
  const items = text
    .split(/[,;\n]/)
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  if (items.length > MAX_STEPS) return { ok: false, error: `At most ${MAX_STEPS} steps` };
  const steps: TaskStep[] = [];
  for (const item of items) {
    const match = DURATION.exec(item);
    const minutes = match ? parseDuration(match[1] ?? '') : null;
    if (!match || minutes === null || minutes < 1) {
      return { ok: false, error: `“${item}” needs a duration, like 5m or 1h` };
    }
    if (minutes > 1440) return { ok: false, error: `“${item}” is longer than a day` };
    const rest = `${item.slice(0, match.index)} ${item.slice(match.index + match[0].length)}`
      .replace(/\s+/g, ' ')
      .trim();
    const wait = WAIT.test(rest);
    const title = (wait ? rest.replace(WAIT, '') : rest).trim().slice(0, 80);
    if (!wait && !title) return { ok: false, error: `Name the step that takes ${match[1]}` };
    steps.push({ title, minutes, wait });
  }
  return { ok: true, steps };
}

/** The one-line form `parseSteps` reads back. */
export function formatSteps(steps: readonly TaskStep[]): string {
  return steps
    .map((s) =>
      s.wait
        ? `wait ${formatMinutes(s.minutes)}${s.title ? ` ${s.title}` : ''}`
        : `${s.title} ${formatMinutes(s.minutes)}`,
    )
    .join(', ');
}

/** Minutes the user is busy (hands-on) and from the first step to the last. */
export function stepTotals(steps: readonly TaskStep[]): { handsOnMin: number; totalMin: number } {
  let handsOnMin = 0;
  let totalMin = 0;
  for (const s of steps) {
    totalMin += s.minutes;
    if (!s.wait) handsOnMin += s.minutes;
  }
  return { handsOnMin, totalMin };
}
