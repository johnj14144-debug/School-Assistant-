import { randomUUID } from 'node:crypto';
import {
  type Block,
  type BlockSpan,
  type BlockView,
  type blockCreateSchema,
  type blockUpdateSchema,
  type CalendarRange,
  expandFixedEvents,
  FIXED_EVENT_COLORS,
  type FixedEvent,
  type FixedSpan,
  findBlockConflict,
  type fixedEventCreateSchema,
  fixedEventProblem,
  type fixedEventSkipSchema,
  type fixedEventUpdateSchema,
  isBackgroundBlock,
  nightsWithoutSleep,
  type Occurrence,
  type OccurrenceView,
  occurrenceDates,
  parseLocalDate,
  parseRRule,
  startOfZonedDay,
  type Task,
} from '@sa/core';
import { and, asc, eq, gt, inArray, isNull, lt } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../../db/database';
import { blocks, courses, fixedEvents, tasks, timeSessions } from '../../db/schema';
import type { SettingsService } from '../../db/settings';
import { describeSession, normalizeInstant } from '../tasks/snapshot';

export interface CalendarDeps {
  db: Db;
  settings: SettingsService;
  now?: () => Date;
  newId?: () => string;
  /** The laptop's zone, in which the calendar shows days. */
  displayZone?: () => string;
  /** Called after every change to fixed events or blocks. */
  onChange?: () => void;
}

const DAY_MS = 86_400_000;
const MAX_RANGE_DAYS = 62;
/** Blocks with no task and no course are indigo, like the app's accent. */
const BLOCK_COLOR = '#6366f1';
const KIND_ORDER: Record<FixedEvent['kind'], number> = {
  sleep: 0,
  hygiene: 1,
  meal: 2,
  class: 3,
  other: 4,
};

type TaskRef = Pick<Task, 'id' | 'title' | 'status' | 'attention' | 'courseId'>;
type FixedEventPatch = Omit<z.output<typeof fixedEventUpdateSchema>, 'id'>;

/** Drops keys whose value is undefined (left out of an update). */
function defined<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/** The routine (fixed events, with skipped dates) and planned blocks, and ranges of both. */
export class CalendarService {
  private readonly db: Db;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly displayZone: () => string;
  private readonly changed: () => void;

  constructor(private readonly deps: CalendarDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? randomUUID;
    this.displayZone = deps.displayZone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    this.changed = deps.onChange ?? (() => {});
  }

  // Fixed events

  /** Sleep, hygiene, meals, classes, then the rest; by start time within each. */
  listFixedEvents(): FixedEvent[] {
    return this.db
      .select()
      .from(fixedEvents)
      .all()
      .sort(
        (a, b) =>
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          a.startLocal.localeCompare(b.startLocal) ||
          a.title.localeCompare(b.title),
      );
  }

  createFixedEvent(input: z.output<typeof fixedEventCreateSchema>): FixedEvent {
    this.checkFixedEvent(input);
    const stamp = this.now().toISOString();
    const event: FixedEvent = {
      ...input,
      exceptions: [],
      id: this.newId(),
      createdAt: stamp,
      updatedAt: stamp,
    };
    this.db.insert(fixedEvents).values(event).run();
    this.changed();
    return event;
  }

  updateFixedEvent({ id, ...patch }: z.output<typeof fixedEventUpdateSchema>): FixedEvent {
    const current = this.requireFixedEvent(id);
    const changes: FixedEventPatch = defined(patch);
    const next = { ...current, ...changes };
    this.checkFixedEvent(next);
    // Sleep is never skipped, so an event that becomes sleep loses its skipped dates.
    const exceptions = next.kind === 'sleep' ? [] : current.exceptions;
    this.db
      .update(fixedEvents)
      .set({ ...changes, exceptions, updatedAt: this.now().toISOString() })
      .where(eq(fixedEvents.id, id))
      .run();
    this.changed();
    return this.requireFixedEvent(id);
  }

  deleteFixedEvent(id: string): void {
    this.requireFixedEvent(id);
    this.db.delete(fixedEvents).where(eq(fixedEvents.id, id)).run();
    this.changed();
  }

  /** Skips one occurrence (a cancelled class) or brings it back. Sleep can't be skipped. */
  skipOccurrence({ id, date, skip }: z.output<typeof fixedEventSkipSchema>): FixedEvent {
    const event = this.requireFixedEvent(id);
    const skipped = new Set(event.exceptions);
    if (skip) {
      if (event.kind === 'sleep') {
        throw new Error("Sleep can't be skipped: the sleep floor is protected.");
      }
      const day = parseLocalDate(date);
      const first = parseLocalDate(event.startDate);
      const rule = event.rrule ? parseRRule(event.rrule) : null;
      if (!day || !first || occurrenceDates(rule, first, day, day).length === 0) {
        throw new Error(`${event.title} doesn't happen on ${date}.`);
      }
      skipped.add(date);
    } else {
      skipped.delete(date);
    }
    this.db
      .update(fixedEvents)
      .set({ exceptions: [...skipped].sort(), updatedAt: this.now().toISOString() })
      .where(eq(fixedEvents.id, id))
      .run();
    this.changed();
    return this.requireFixedEvent(id);
  }

  // Blocks

  createBlock(input: z.output<typeof blockCreateSchema>): Block {
    const fields = {
      ...input,
      startAt: normalizeInstant(input.startAt),
      endAt: normalizeInstant(input.endAt),
    };
    this.checkBlock({ ...fields, kind: 'work' }, { overlap: true, linking: true });
    const stamp = this.now().toISOString();
    const block: Block = {
      ...fields,
      source: 'manual',
      kind: 'work',
      reason: '',
      id: this.newId(),
      createdAt: stamp,
      updatedAt: stamp,
    };
    this.db.insert(blocks).values(block).run();
    this.changed();
    return block;
  }

  /**
   * Moves, resizes, relabels or (un)locks a block. A planner block moved by hand becomes the
   * user's own (manual), so the next "Plan my week" keeps it where it was put.
   */
  updateBlock({ id, ...patch }: z.output<typeof blockUpdateSchema>): Block {
    const current = this.requireBlock(id);
    const changes: Partial<Block> = defined(patch);
    if (changes.startAt) changes.startAt = normalizeInstant(changes.startAt);
    if (changes.endAt) changes.endAt = normalizeInstant(changes.endAt);
    const next = { ...current, ...changes };
    const moved =
      next.startAt !== current.startAt ||
      next.endAt !== current.endAt ||
      next.taskId !== current.taskId;
    if (moved || next.title !== current.title) {
      this.checkBlock(next, { overlap: moved, linking: next.taskId !== current.taskId });
    }
    if (moved && current.source === 'planner') {
      changes.source = 'manual';
      changes.reason = '';
    }
    this.db
      .update(blocks)
      .set({ ...changes, updatedAt: this.now().toISOString() })
      .where(eq(blocks.id, id))
      .run();
    this.changed();
    return this.requireBlock(id);
  }

  deleteBlock(id: string): void {
    this.requireBlock(id);
    this.db.delete(blocks).where(eq(blocks.id, id)).run();
    this.changed();
  }

  // Views

  /** Occurrences and blocks that overlap [from, to), at most 62 days. */
  range(fromIso: string, toIso: string): CalendarRange {
    const from = normalizeInstant(fromIso);
    const to = normalizeInstant(toIso);
    const span = Date.parse(to) - Date.parse(from);
    if (span <= 0) throw new Error('The range must end after it starts.');
    if (span > MAX_RANGE_DAYS * DAY_MS) throw new Error(`Ask for at most ${MAX_RANGE_DAYS} days.`);

    const blockRows = this.blocksBetween(from, to);
    // Expand over the blocks too, so a block reaching outside the range still sees its conflicts.
    const expandFrom = blockRows.reduce((min, b) => (b.startAt < min ? b.startAt : min), from);
    const expandTo = blockRows.reduce((max, b) => (b.endAt > max ? b.endAt : max), to);
    const events = this.listFixedEvents();
    const occurrences = expandFixedEvents(events, expandFrom, expandTo, {
      sleepFloorMin: this.sleepFloorMin(),
    });
    const inRange = occurrences.filter((o) => o.startAt < to && o.endAt > from);
    const courseRows = this.db
      .select({ id: courses.id, name: courses.name, code: courses.code, color: courses.color })
      .from(courses)
      .all();
    const courseById = new Map(courseRows.map((c) => [c.id, c]));

    const taskById = this.tasksFor(blockRows);
    const running = new Set(
      this.db
        .select({ taskId: timeSessions.taskId })
        .from(timeSessions)
        .where(isNull(timeSessions.endAt))
        .all()
        .map((r) => r.taskId),
    );
    const spans = this.blockSpans(blockRows, taskById);
    const fixed = fixedSpans(occurrences);

    return {
      occurrences: inRange.map((o) => this.occurrenceView(o, courseById)),
      blocks: blockRows.map((block, i) => {
        const task = block.taskId ? (taskById.get(block.taskId) ?? null) : null;
        const course = task?.courseId ? (courseById.get(task.courseId) ?? null) : null;
        const own = spans[i] as BlockSpan;
        const conflict = findBlockConflict(own, spans, fixed);
        return {
          ...block,
          task: task && {
            id: task.id,
            title: task.title,
            status: task.status,
            attention: task.attention,
            course,
            running: running.has(task.id),
          },
          label: own.label,
          color: course?.color ?? BLOCK_COLOR,
          conflict: conflict ? describeSession(conflict.label, conflict, this.now()) : null,
        } satisfies BlockView;
      }),
      nightsWithoutSleep: this.nightsWithoutSleep(inRange, from, to),
    };
  }

  // Helpers

  /** Nights from today on with no sleep in the routine (past nights can't be protected). */
  private nightsWithoutSleep(occurrences: Occurrence<FixedEvent>[], from: string, to: string) {
    const zone = this.displayZone();
    const today = new Date(startOfZonedDay(this.now().getTime(), zone)).toISOString();
    const start = from > today ? from : today;
    return start < to ? nightsWithoutSleep(occurrences, start, to, zone) : [];
  }

  private sleepFloorMin(): number {
    return this.deps.settings.get('calendar.sleepFloorMin');
  }

  private checkFixedEvent(
    event: Omit<FixedEvent, 'id' | 'exceptions' | 'createdAt' | 'updatedAt'>,
  ) {
    const problem = fixedEventProblem(event, this.sleepFloorMin());
    if (problem) throw new Error(problem);
    if (event.courseId) {
      const found = this.db
        .select({ id: courses.id })
        .from(courses)
        .where(eq(courses.id, event.courseId))
        .get();
      if (!found) throw new Error('Course not found');
    }
  }

  /** A block needs a task or a title, a sane length, and no collision (core's rules). */
  private checkBlock(
    block: Pick<Block, 'taskId' | 'title' | 'startAt' | 'endAt' | 'kind'> & { id?: string },
    check: { overlap: boolean; linking: boolean },
  ): void {
    const task = block.taskId ? this.requireTask(block.taskId) : null;
    if (!task && !block.title.trim()) throw new Error('Pick a task or give the block a title.');
    if (check.linking && task?.status === 'done') {
      throw new Error(`“${task.title}” is already done.`);
    }
    const length = Date.parse(block.endAt) - Date.parse(block.startAt);
    if (length <= 0) throw new Error('A block must end after it starts.');
    if (length > DAY_MS) throw new Error('A block can be at most 24 hours long.');
    if (!check.overlap) return;
    const others = this.blocksBetween(block.startAt, block.endAt);
    const occurrences = expandFixedEvents(this.listFixedEvents(), block.startAt, block.endAt, {
      sleepFloorMin: this.sleepFloorMin(),
    });
    const conflict = findBlockConflict(
      {
        id: block.id,
        startAt: block.startAt,
        endAt: block.endAt,
        background: isBackgroundBlock(block.kind, task?.attention ?? null),
      },
      this.blockSpans(others, this.tasksFor(others)),
      fixedSpans(occurrences),
    );
    if (conflict) {
      throw new Error(`That overlaps ${describeSession(conflict.label, conflict, this.now())}.`);
    }
  }

  private blocksBetween(from: string, to: string): Block[] {
    return this.db
      .select()
      .from(blocks)
      .where(and(lt(blocks.startAt, to), gt(blocks.endAt, from)))
      .orderBy(asc(blocks.startAt))
      .all();
  }

  private tasksFor(rows: Block[]): Map<string, TaskRef> {
    const ids = [...new Set(rows.flatMap((b) => (b.taskId ? [b.taskId] : [])))];
    if (ids.length === 0) return new Map();
    const found = this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        attention: tasks.attention,
        courseId: tasks.courseId,
      })
      .from(tasks)
      .where(inArray(tasks.id, ids))
      .all();
    return new Map(found.map((t) => [t.id, t]));
  }

  private blockSpans(rows: Block[], taskById: Map<string, TaskRef>): BlockSpan[] {
    return rows.map((b) => {
      const task = b.taskId ? taskById.get(b.taskId) : undefined;
      return {
        id: b.id,
        startAt: b.startAt,
        endAt: b.endAt,
        background: isBackgroundBlock(b.kind, task?.attention ?? null),
        label: b.title || task?.title || 'Block',
      };
    });
  }

  private occurrenceView(
    o: Occurrence<FixedEvent>,
    courseById: Map<string, { code: string; name: string; color: string }>,
  ): OccurrenceView {
    const { event } = o;
    const course = event.courseId ? courseById.get(event.courseId) : undefined;
    return {
      eventId: event.id,
      title: event.title,
      kind: event.kind,
      location: event.location,
      courseId: event.courseId,
      color: course?.color ?? FIXED_EVENT_COLORS[event.kind],
      date: o.date,
      startAt: o.startAt,
      endAt: o.endAt,
      extendedMin: o.extendedMin,
    };
  }

  private requireFixedEvent(id: string): FixedEvent {
    const row = this.db.select().from(fixedEvents).where(eq(fixedEvents.id, id)).get();
    if (!row) throw new Error('Event not found');
    return row;
  }

  private requireBlock(id: string): Block {
    const row = this.db.select().from(blocks).where(eq(blocks.id, id)).get();
    if (!row) throw new Error('Block not found');
    return row;
  }

  private requireTask(id: string): TaskRef {
    const row = this.db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        attention: tasks.attention,
        courseId: tasks.courseId,
      })
      .from(tasks)
      .where(eq(tasks.id, id))
      .get();
    if (!row) throw new Error('Task not found');
    return row;
  }
}

function fixedSpans(occurrences: Occurrence<FixedEvent>[]): FixedSpan[] {
  return occurrences.map((o) => ({
    kind: o.event.kind,
    label: o.event.title,
    startAt: o.startAt,
    endAt: o.endAt,
  }));
}
