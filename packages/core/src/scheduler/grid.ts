import { addDays } from '../time/local-date';
import { fromZoned, toZoned } from '../time/zone';

/**
 * The planner's view of time: 5-minute slots from the start of the plan to its end, each with
 * flags for what already takes it. Slot `i` covers [start + 5i min, start + 5(i+1) min).
 */

export const SLOT_MIN = 5;
export const SLOT_MS = SLOT_MIN * 60_000;

/** Sleep, a class or another commitment: nothing of ours, not even a wait (owner decision Q10). */
export const HARD = 1;
/** A meal or routine item: no hands-on work, but a wait (the washer running) is fine. */
export const SOFT = 2;
/** Focus or light work on a task: a break separates it from the next work block. */
export const WORK = 4;
/** Something else that needs the user: a hands-on step, a block without a task. */
export const BUSY = 8;

export class Grid {
  constructor(
    /** UTC ms of slot 0 (a multiple of 5 minutes). */
    readonly start: number,
    readonly size: number,
    /** Local day number (0 = the first) of each slot, in the display zone. */
    readonly day: Int32Array,
    readonly flags: Uint8Array = new Uint8Array(size),
  ) {}

  static create(start: number, size: number, timeZone: string): Grid {
    return new Grid(start, size, dayIndexes(start, size, timeZone));
  }

  clone(): Grid {
    return new Grid(this.start, this.size, this.day, new Uint8Array(this.flags));
  }

  /** The first slot starting at or after `ms`. */
  ceil(ms: number): number {
    return Math.ceil((ms - this.start) / SLOT_MS);
  }

  /** The last slot boundary at or before `ms`. */
  floor(ms: number): number {
    return Math.floor((ms - this.start) / SLOT_MS);
  }

  time(slot: number): number {
    return this.start + slot * SLOT_MS;
  }

  /** Flags every slot that [fromMs, toMs) touches. */
  mark(fromMs: number, toMs: number, flag: number): void {
    const a = Math.max(0, this.floor(fromMs));
    const b = Math.min(this.size, this.ceil(toMs));
    for (let i = a; i < b; i++) this.flags[i] = (this.flags[i] ?? 0) | flag;
  }

  /** Flags slots [a, b). */
  markSlots(a: number, b: number, flag: number): void {
    for (let i = Math.max(0, a); i < Math.min(this.size, b); i++) {
      this.flags[i] = (this.flags[i] ?? 0) | flag;
    }
  }

  isFree(a: number, b: number): boolean {
    if (a < 0 || b > this.size) return false;
    for (let i = a; i < b; i++) if (this.flags[i] !== 0) return false;
    return true;
  }

  hasFlag(a: number, b: number, flag: number): boolean {
    for (let i = Math.max(0, a); i < Math.min(this.size, b); i++) {
      if ((this.flags[i] ?? 0) & flag) return true;
    }
    return false;
  }

  /** Number of free slots in [0, i) for every i: `prefix[b] - prefix[a]` counts free slots. */
  freePrefix(): Int32Array {
    const prefix = new Int32Array(this.size + 1);
    for (let i = 0; i < this.size; i++) {
      prefix[i + 1] = (prefix[i] ?? 0) + (this.flags[i] === 0 ? 1 : 0);
    }
    return prefix;
  }

  /** Maximal stretches of free slots, in order. */
  runs(): [number, number][] {
    const out: [number, number][] = [];
    for (let i = 0; i < this.size; ) {
      if (this.flags[i] !== 0) {
        i++;
        continue;
      }
      let e = i;
      while (e < this.size && this.flags[e] === 0) e++;
      out.push([i, e]);
      i = e;
    }
    return out;
  }
}

function dayIndexes(start: number, size: number, timeZone: string): Int32Array {
  const day = new Int32Array(size);
  const z = toZoned(start, timeZone);
  let date = { year: z.year, month: z.month, day: z.day };
  let index = 0;
  let next = fromZoned({ ...addDays(date, 1), hour: 0, minute: 0 }, timeZone);
  for (let i = 0; i < size; i++) {
    const t = start + i * SLOT_MS;
    while (t >= next) {
      index++;
      date = addDays(date, 1);
      next = fromZoned({ ...addDays(date, 1), hour: 0, minute: 0 }, timeZone);
    }
    day[i] = index;
  }
  return day;
}
