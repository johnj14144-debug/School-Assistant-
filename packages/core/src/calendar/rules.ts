import type { TaskAttention } from '../tasks/schemas';
import { wallMinutes } from '../time/expand';
import { compareDates, parseLocalDate } from '../time/local-date';
import { parseRRule } from '../time/recurrence';
import type { BlockKind, FixedEventKind } from './schemas';

/**
 * Calendar rules (M4). A fixed event must make sense on its own; blocks (planned task time) may
 * not collide:
 *
 * 1. Nothing is planned during sleep (the floor is protected no matter what).
 * 2. A focus/light block (or one without a task) overlaps no fixed event and no other such block:
 *    one thing at a time, and classes and meals stay free.
 * 3. A background block (laundry running) may overlap meals, routine items and other blocks,
 *    but not sleep, classes or other commitments (tutoring, a chapter meeting): the user is away
 *    or busy then (owner decision Q10).
 *
 * Intervals are half-open: a block may start the minute a class ends.
 */

export interface FixedEventShape {
  kind: FixedEventKind;
  startDate: string;
  startLocal: string;
  endLocal: string;
  rrule: string | null;
}

const formatFloor = (min: number) =>
  min % 60 === 0 ? `${min / 60} h` : `${Math.floor(min / 60)} h ${min % 60} min`;

/** Why a fixed event can't be saved as it is, or null. */
export function fixedEventProblem(event: FixedEventShape, sleepFloorMin: number): string | null {
  if (event.startLocal === event.endLocal) return 'The end time must differ from the start time';
  if (event.kind === 'sleep' && wallMinutes(event.startLocal, event.endLocal) < sleepFloorMin) {
    return `Sleep must be at least ${formatFloor(sleepFloorMin)} (the sleep floor)`;
  }
  if (event.rrule) {
    const until = parseRRule(event.rrule).until;
    const first = parseLocalDate(event.startDate);
    if (until && first && compareDates(until, first) < 0) {
      return 'The repeat ends before the first day';
    }
  }
  return null;
}

export interface Span {
  /** UTC ISO instants. */
  startAt: string;
  endAt: string;
}

export interface BlockSpan extends Span {
  id: string;
  /** The block is for a background task (it may overlap other things). */
  background: boolean;
  label: string;
}

export interface FixedSpan extends Span {
  kind: FixedEventKind;
  label: string;
}

export interface BlockConflict extends Span {
  with: 'block' | 'fixed';
  label: string;
}

/**
 * Whether a block runs alongside other things: a wait between steps always does, a hands-on step
 * never, and work does when its task is a background task.
 */
export function isBackgroundBlock(kind: BlockKind, attention: TaskAttention | null): boolean {
  return kind === 'wait' || (kind === 'work' && attention === 'background');
}

/** Fixed events a background block may run alongside. */
const BACKGROUND_OK: ReadonlySet<FixedEventKind> = new Set(['meal', 'hygiene']);

const overlaps = (a: Span, b: Span) =>
  Date.parse(a.startAt) < Date.parse(b.endAt) && Date.parse(b.startAt) < Date.parse(a.endAt);

/**
 * The first fixed event or block `candidate` would collide with under the rules above, or
 * null. The candidate's own id (when moving it) is ignored.
 */
export function findBlockConflict(
  candidate: Span & { id?: string; background: boolean },
  blocks: readonly BlockSpan[],
  fixed: readonly FixedSpan[],
): BlockConflict | null {
  for (const f of fixed) {
    if (!overlaps(candidate, f)) continue;
    if (!candidate.background || !BACKGROUND_OK.has(f.kind)) {
      return { with: 'fixed', label: f.label, startAt: f.startAt, endAt: f.endAt };
    }
  }
  if (candidate.background) return null;
  for (const b of blocks) {
    if (b.id === candidate.id || b.background || !overlaps(candidate, b)) continue;
    return { with: 'block', label: b.label, startAt: b.startAt, endAt: b.endAt };
  }
  return null;
}

export interface AgendaEntry extends Span {
  kind: 'block' | 'fixed';
  /** A background block runs alongside; it is "now" only when nothing else is. */
  background: boolean;
}

const rank = (e: AgendaEntry) => (e.kind === 'block' ? (e.background ? 2 : 0) : 1);

/**
 * What's happening now and what comes next, for the Today page. Now: the entry covering `now`
 * (a block first, then a fixed event, then a background block; the latest start wins a tie).
 * Next: the earliest entry starting after now, other than background blocks.
 */
export function agendaNow<T extends AgendaEntry>(
  entries: readonly T[],
  now: Date,
): { current: T | null; next: T | null } {
  const t = now.getTime();
  let current: T | null = null;
  let next: T | null = null;
  for (const e of entries) {
    const start = Date.parse(e.startAt);
    if (start <= t && t < Date.parse(e.endAt)) {
      if (
        !current ||
        rank(e) < rank(current) ||
        (rank(e) === rank(current) && start > Date.parse(current.startAt))
      ) {
        current = e;
      }
    } else if (start > t && !(e.kind === 'block' && e.background)) {
      if (
        !next ||
        start < Date.parse(next.startAt) ||
        (start === Date.parse(next.startAt) && rank(e) < rank(next))
      ) {
        next = e;
      }
    }
  }
  return { current, next };
}
