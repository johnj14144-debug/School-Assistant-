import { z } from 'zod';

/** One rung of a letter scale: the lowest percent (inclusive) that earns `letter`. */
export const letterCutoffSchema = z.object({
  letter: z.string().min(1),
  minPercent: z.number().min(0),
});

export const letterScaleSchema = z.array(letterCutoffSchema).min(1);

export type LetterCutoff = z.infer<typeof letterCutoffSchema>;
export type LetterScale = z.infer<typeof letterScaleSchema>;

/** Common US plus/minus scale. Each course can override it with its syllabus scale. */
export const DEFAULT_LETTER_SCALE: LetterScale = [
  { letter: 'A', minPercent: 93 },
  { letter: 'A-', minPercent: 90 },
  { letter: 'B+', minPercent: 87 },
  { letter: 'B', minPercent: 83 },
  { letter: 'B-', minPercent: 80 },
  { letter: 'C+', minPercent: 77 },
  { letter: 'C', minPercent: 73 },
  { letter: 'C-', minPercent: 70 },
  { letter: 'D+', minPercent: 67 },
  { letter: 'D', minPercent: 63 },
  { letter: 'D-', minPercent: 60 },
  { letter: 'F', minPercent: 0 },
];

/** Plain scale without plus/minus, used by some courses. */
export const PLAIN_LETTER_SCALE: LetterScale = [
  { letter: 'A', minPercent: 90 },
  { letter: 'B', minPercent: 80 },
  { letter: 'C', minPercent: 70 },
  { letter: 'D', minPercent: 60 },
  { letter: 'F', minPercent: 0 },
];

/** Percent earned (0–100+), or null when nothing has been graded yet. */
export function percent(earned: number, possible: number): number | null {
  if (possible <= 0) return null;
  // Multiply first so whole-number scores stay exact (55/50 → 110, not 110.00000000000001).
  return (earned * 100) / possible;
}

/** Letter for a percent. Scale order doesn't matter; below every cutoff gets the lowest letter. */
export function letterFor(value: number, scale: LetterScale = DEFAULT_LETTER_SCALE): string {
  const sorted = [...letterScaleSchema.parse(scale)].sort((a, b) => b.minPercent - a.minPercent);
  const match = sorted.find((cutoff) => value >= cutoff.minPercent) ?? sorted.at(-1);
  if (!match) throw new Error('Letter scale must have at least one cutoff');
  return match.letter;
}
