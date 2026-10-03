import { type LetterScale, letterFor } from '@sa/core';
import { formatPercent } from '../../lib/format';

/** "86.25% (B)", or an em dash before anything is graded. */
export function gradeText(value: number | null, scale: LetterScale): string {
  return value === null ? '—' : `${formatPercent(value)} (${letterFor(value, scale)})`;
}

export function letterText(value: number | null, scale: LetterScale): string {
  return value === null ? '—' : letterFor(value, scale);
}
