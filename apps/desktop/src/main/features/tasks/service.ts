import { randomUUID } from 'node:crypto';
import {
  type HistoryView,
  minutesWithin,
  type Task,
  type TaskDetail,
  type TaskListItem,
  type TodayView,
  type taskCompleteSchema,
  type taskCreateSchema,
  type taskUpdateSchema,
  typeGroups,
} from '@sa/core';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../../db/database';
import { assignments, courses, tasks, timeSessions } from '../../db/schema';
import type { SettingsService } from '../../db/settings';
import { loadSnapshot, normalizeInstant, type TaskSnapshot } from './snapshot';

export interface TasksDeps {
  db: Db;
  settings: SettingsService;
  now?: () => Date;
  newId?: () => string;
  /** Called after every change to tasks or the timer (the window and tray refresh). */
  onChange?: () => void;
}

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

/** Open tasks: due first (soonest first), then priority, then oldest. */
function openOrder(a: Task, b: Task): number {
  if (a.dueAt !== b.dueAt) {
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return a.dueAt < b.dueAt ? -1 : 1;
  }
  const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  return rank !== 0 ? rank : a.createdAt.localeCompare(b.createdAt);
}

/** Start of the laptop's current local day. */
export function localDayStart(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Tasks with subtasks, the Today list, completion and history. The timer is TimerService. */
export class TasksService {
  private readonly db: Db;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly changed: () => void;

  constructor(private readonly deps: TasksDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? randomUUID;
    this.changed = deps.onChange ?? (() => {});
  }

  list(status: 'open' | 'done'): TaskListItem[] {
    const snap = this.snapshot();
    const rows = snap.tasks.filter((t) => t.status === status);
    if (status === 'open') rows.sort(openOrder);
    else rows.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
    return rows.map((t) => snap.item(t));
  }

  get(id: string): TaskDetail {
    const snap = this.snapshot();
    const task = snap.byId.get(id);
    if (!task) throw new Error('Task not found');
    const ancestors: { id: string; title: string }[] = [];
    for (let p = task.parentId; p !== null; ) {
      const parent = snap.byId.get(p);
      if (!parent || ancestors.some((a) => a.id === parent.id)) break;
      ancestors.unshift({ id: parent.id, title: parent.title });
      p = parent.parentId;
    }
    const assignment = task.assignmentId
      ? (this.db
          .select({ id: assignments.id, title: assignments.title, dueAt: assignments.dueAt })
          .from(assignments)
          .where(eq(assignments.id, task.assignmentId))
          .get() ?? null)
      : null;
    const subtasks = [...(snap.children.get(id) ?? [])].sort(
      (a, b) =>
        (a.status === 'done' ? 1 : 0) - (b.status === 'done' ? 1 : 0) ||
        a.createdAt.localeCompare(b.createdAt),
    );
    return {
      task: snap.item(task),
      assignment,
      ancestors,
      subtasks: subtasks.map((t) => snap.item(t)),
      sessions: snap.sessions.filter((s) => s.taskId === id).reverse(),
      ownMin: snap.own.get(id) ?? 0,
    };
  }

  /** Distinct task types in use, most used first, for suggestions. */
  types(): string[] {
    return this.db
      .select({ type: sql<string>`min(${tasks.type})` })
      .from(tasks)
      .where(sql`${tasks.type} <> ''`)
      .groupBy(sql`lower(${tasks.type})`)
      .orderBy(sql`count(*) desc`)
      .all()
      .map((r) => r.type);
  }

  create(input: z.output<typeof taskCreateSchema>): Task {
    const { today, ...fields } = input;
    const parent = fields.parentId ? this.require(fields.parentId) : null;
    // An assignment brings its course; otherwise a subtask takes its parent's.
    const courseId =
      fields.courseId !== undefined
        ? fields.courseId
        : fields.assignmentId
          ? null
          : (parent?.courseId ?? null);
    const links = this.resolveLinks(courseId, fields.assignmentId);
    const stamp = this.now().toISOString();
    const task: Task = {
      ...fields,
      ...links,
      type: fields.type ?? parent?.type ?? '',
      dueAt: fields.dueAt === null ? null : normalizeInstant(fields.dueAt),
      todayOrder: today ? this.nextTodayOrder() : null,
      status: 'open',
      completedAt: null,
      completionNote: '',
      id: this.newId(),
      createdAt: stamp,
      updatedAt: stamp,
    };
    this.db.insert(tasks).values(task).run();
    this.changed();
    return task;
  }

  update({ id, ...patch }: z.output<typeof taskUpdateSchema>): Task {
    const task = this.require(id);
    if (patch.parentId !== undefined && patch.parentId !== null) {
      this.require(patch.parentId);
      if (this.snapshot().subtree(id).includes(patch.parentId)) {
        throw new Error("A task can't be a subtask of itself or of its own subtasks");
      }
    }
    if (patch.courseId !== undefined || patch.assignmentId !== undefined) {
      const assignmentId =
        patch.assignmentId === undefined ? task.assignmentId : patch.assignmentId;
      // Linking an assignment alone moves the task to the assignment's course.
      const courseId =
        patch.courseId !== undefined ? patch.courseId : patch.assignmentId ? null : task.courseId;
      const courseOnly = patch.courseId !== undefined && patch.assignmentId === undefined;
      Object.assign(patch, this.resolveLinks(courseId, assignmentId, courseOnly));
    }
    if (patch.attention !== undefined && patch.attention !== task.attention) {
      this.checkAttentionChange(task, patch.attention);
    }
    if (patch.dueAt) patch.dueAt = normalizeInstant(patch.dueAt);
    this.db
      .update(tasks)
      .set({ ...patch, updatedAt: this.now().toISOString() })
      .where(eq(tasks.id, id))
      .run();
    this.changed();
    return this.require(id);
  }

  /** Deletes the task with its subtasks and their timer sessions. */
  delete(id: string): void {
    this.require(id);
    const removed = this.snapshot().subtree(id);
    this.db.delete(tasks).where(eq(tasks.id, id)).run();
    this.clearPausedIfIn(removed);
    this.changed();
  }

  /**
   * Marks the task done with a note; its timers (and its subtasks') stop now. For a task that
   * is already done, only the note changes.
   */
  complete({ id, note }: z.output<typeof taskCompleteSchema>): Task {
    const task = this.require(id);
    const stamp = this.now().toISOString();
    if (task.status === 'done') {
      this.db
        .update(tasks)
        .set({ completionNote: note, updatedAt: stamp })
        .where(eq(tasks.id, id))
        .run();
      this.changed();
      return this.require(id);
    }
    const subtree = this.snapshot().subtree(id);
    this.db.transaction((tx) => {
      tx.update(timeSessions)
        .set({ endAt: stamp })
        .where(and(inArray(timeSessions.taskId, subtree), isNull(timeSessions.endAt)))
        .run();
      tx.update(tasks)
        .set({ status: 'done', completedAt: stamp, completionNote: note, updatedAt: stamp })
        .where(eq(tasks.id, id))
        .run();
    });
    this.clearPausedIfIn(subtree);
    this.changed();
    return this.require(id);
  }

  reopen(id: string): Task {
    this.require(id);
    this.db
      .update(tasks)
      .set({ status: 'open', completedAt: null, updatedAt: this.now().toISOString() })
      .where(eq(tasks.id, id))
      .run();
    this.changed();
    return this.require(id);
  }

  /** Puts the task at the end of the Today list, or takes it off. */
  setToday(id: string, onToday: boolean): void {
    const task = this.require(id);
    if (onToday === (task.todayOrder !== null)) return;
    this.db
      .update(tasks)
      .set({ todayOrder: onToday ? this.nextTodayOrder() : null })
      .where(eq(tasks.id, id))
      .run();
    this.changed();
  }

  /** The Today list in this order; tasks left out keep their order after these. */
  reorderToday(ids: string[]): void {
    const snap = this.snapshot();
    for (const id of ids) if (!snap.byId.has(id)) throw new Error('Task not found');
    const rest = snap.tasks
      .filter((t) => t.todayOrder !== null && !ids.includes(t.id))
      .sort((a, b) => (a.todayOrder ?? 0) - (b.todayOrder ?? 0))
      .map((t) => t.id);
    this.db.transaction((tx) => {
      [...ids, ...rest].forEach((id, index) => {
        tx.update(tasks).set({ todayOrder: index }).where(eq(tasks.id, id)).run();
      });
    });
    this.changed();
  }

  today(): TodayView {
    const now = this.now();
    const snap = this.snapshot(now);
    const dayStart = localDayStart(now);
    const startIso = dayStart.toISOString();
    const open = snap.tasks
      .filter((t) => t.status === 'open' && t.todayOrder !== null)
      .sort((a, b) => (a.todayOrder ?? 0) - (b.todayOrder ?? 0));
    const done = snap.tasks
      .filter((t) => t.status === 'done' && (t.completedAt ?? '') >= startIso)
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
    const focusMinClosed = snap.sessions
      .filter((s) => s.endAt !== null && !snap.isBackground(s.taskId))
      .reduce((sum, s) => sum + minutesWithin(s, dayStart, now), 0);
    return {
      dayStart: startIso,
      tasks: open.map((t) => snap.item(t)),
      done: done.map((t) => snap.item(t)),
      focusMinClosed,
    };
  }

  /** Finished tasks (newest first) and estimate vs actual per course + type. */
  history(): HistoryView {
    const snap = this.snapshot();
    const course = (id: string | null) => (id ? (snap.courses.get(id) ?? null) : null);
    const done = snap.tasks
      .filter((t) => t.status === 'done')
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
    return {
      tasks: done.map((t) => ({
        id: t.id,
        title: t.title,
        parentTitle: t.parentId ? (snap.byId.get(t.parentId)?.title ?? null) : null,
        course: course(t.courseId),
        type: t.type,
        quantity: t.quantity,
        unit: t.unit,
        estimateMin: t.estimateMin,
        actualMin: snap.rollup.get(t.id) ?? 0,
        completedAt: t.completedAt ?? t.updatedAt,
        completionNote: t.completionNote,
      })),
      groups: typeGroups(snap.tasks, snap.own, snap.rollup).map(({ courseId, ...group }) => ({
        ...group,
        course: course(courseId),
      })),
    };
  }

  require(id: string): Task {
    const task = this.db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!task) throw new Error('Task not found');
    return task;
  }

  private snapshot(now = this.now()): TaskSnapshot {
    return loadSnapshot(this.db, now);
  }

  private nextTodayOrder(): number {
    const last = this.db
      .select({ order: sql<number | null>`max(${tasks.todayOrder})` })
      .from(tasks)
      .get();
    return (last?.order ?? -1) + 1;
  }

  /**
   * An assignment belongs to a course: linking one sets the course (null `courseId`), and a
   * course that doesn't match is an error. `courseOnly`: the user changed just the course, so a
   * link to another course's assignment is dropped instead.
   */
  private resolveLinks(
    courseId: string | null,
    assignmentId: string | null,
    courseOnly = false,
  ): { courseId: string | null; assignmentId: string | null } {
    if (courseId !== null) {
      const course = this.db.select().from(courses).where(eq(courses.id, courseId)).get();
      if (!course) throw new Error('Course not found');
    }
    if (assignmentId === null) return { courseId, assignmentId };
    const assignment = this.db
      .select()
      .from(assignments)
      .where(eq(assignments.id, assignmentId))
      .get();
    if (!assignment) throw new Error('Assignment not found');
    if (courseId !== null && courseId !== assignment.courseId) {
      if (courseOnly) return { courseId, assignmentId: null };
      throw new Error('That assignment belongs to a different course');
    }
    return { courseId: assignment.courseId, assignmentId };
  }

  /** A running background task can only become a focus task when no other focus task runs. */
  private checkAttentionChange(task: Task, attention: Task['attention']): void {
    if (attention === 'background') return;
    const snap = this.snapshot();
    if (!snap.running.has(task.id)) return;
    const other = snap
      .openSessions()
      .find((s) => s.taskId !== task.id && !snap.isBackground(s.taskId));
    if (other) {
      const title = snap.byId.get(other.taskId)?.title ?? 'another task';
      throw new Error(`${title} is being timed. Stop one of the two timers first.`);
    }
  }

  private clearPausedIfIn(taskIds: string[]): void {
    const paused = this.deps.settings.get('timer.paused');
    if (paused && taskIds.includes(paused.taskId)) this.deps.settings.set('timer.paused', null);
  }
}
