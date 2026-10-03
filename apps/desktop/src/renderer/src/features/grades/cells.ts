/** Parsing for Grade Calc's editable cells. Throwing makes the cell revert (EditableCell). */

const NUMBER = /^\d+(?:\.\d+)?$|^\.\d+$/;

function toNumber(text: string, what: string): number {
  const trimmed = text.trim();
  if (!NUMBER.test(trimmed)) throw new Error(`${what} must be a number`);
  return Number(trimmed);
}

/** A required number such as points possible or a weight: "20", "12.5". */
export function parseAmount(text: string, what = 'This'): number {
  return toNumber(text, what);
}

/** Drop lowest: a whole number, 0 when empty. */
export function parseWholeNumber(text: string, what = 'This'): number {
  if (text.trim() === '') return 0;
  const value = toNumber(text, what);
  if (!Number.isInteger(value)) throw new Error(`${what} must be a whole number`);
  return value;
}

export interface ScoreInput {
  pointsEarned: number | null;
  /** Set when the score was typed as "18/20". */
  pointsPossible?: number;
}

/** An earned cell: "" (not graded yet), "18", or "18/20" to set the points possible too. */
export function parseScore(text: string): ScoreInput {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '—') return { pointsEarned: null };
  const slash = trimmed.indexOf('/');
  if (slash === -1) return { pointsEarned: toNumber(trimmed, 'The score') };
  return {
    pointsEarned: toNumber(trimmed.slice(0, slash), 'The score'),
    pointsPossible: toNumber(trimmed.slice(slash + 1), 'The points possible'),
  };
}

/** A number for a cell: "18", "12.5", or '' for null. */
export function numberText(value: number | null): string {
  return value === null ? '' : String(Number(value.toFixed(4)));
}
