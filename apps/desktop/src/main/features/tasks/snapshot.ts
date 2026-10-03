import {
  type CourseRef,
  ownMinutes,
  rollupMinutes,
  type Task,
  type TaskListItem,
  type TimeSession,
} from '@sa/core';
import { asc } from 'drizzle-orm';
import type { Db } from '../../db/database';
import { courses, tasks, timeSessions } from '../../db/schema';

/**
 * Every task, timer session and course reference, with minutes computed at `now`. Loading it
 * all is cheap at one student's scale (a few thousand rows a year) and keeps the rollups exact.
 */
export class TaskSnapshot {
  readonly byId: Map<string, Task>;
  readonly children = new Map<string, Task[]>();
  readonly courses: Map<string, CourseRef>;
  /** Minutes per task including subtasks. */
  readonly rollup: Map<string, number>;
  /** Minutes per task on its own. */
  readonly own: Map<string, number>;
  /** Tasks with an open session. */
  readonly running = new Set<string>();

  constructor(
    readonly tasks: Task[],
    readonly sessions: TimeSession[],
    courseRefs: CourseRef[],
    readonly now: Date,
  ) {
    this.byId = new Map(tasks.map((t) => [t.id, t]));
    for (const t of tasks) {
      if (t.parentId) this.children.set(t.parentId, [...(this.children.get(t.parentId) ?? []), t]);
    }
    this.courses = new Map(courseRefs.map((c) => [c.id, c]));
    this.own = ownMinutes(sessions, now);
    this.rollup = rollupMinutes(tasks, this.own);
    for (const s of sessions) if (s.endAt === null) this.running.add(s.taskId);
  }

  item(task: Task): TaskListItem {
    const subtasks = this.children.get(task.id) ?? [];
    return {
      ...task,
      course: task.courseId ? (this.courses.get(task.courseId) ?? null) : null,
      actualMin: this.rollup.get(task.id) ?? 0,
      running: this.running.has(task.id),
      subtaskCount: subtasks.length,
      subtasksDone: subtasks.filter((t) => t.status === 'done').length,
    };
  }

  /** The task and everything below it. */
  subtree(id: string): string[] {
    const out: string[] = [];
    const visit = (taskId: string) => {
      if (out.includes(taskId)) return;
      out.push(taskId);
      for (const child of this.children.get(taskId) ?? []) visit(child.id);
    };
    visit(id);
    return out;
  }

  isBackground = (taskId: string): boolean => this.byId.get(taskId)?.attention === 'background';

  openSessions(): TimeSession[] {
    return this.sessions.filter((s) => s.endAt === null);
  }
}

export function loadSnapshot(db: Db, now: Date): TaskSnapshot {
  const allTasks = db.select().from(tasks).orderBy(asc(tasks.createdAt)).all();
  const allSessions = db.select().from(timeSessions).orderBy(asc(timeSessions.startAt)).all();
  const refs = db
    .select({ id: courses.id, name: courses.name, code: courses.code, color: courses.color })
    .from(courses)
    .all();
  return new TaskSnapshot(allTasks, allSessions, refs, now);
}

/** Instants are stored in one format (`toISOString`) so they sort and compare as text. */
export function normalizeInstant(iso: string): string {
  return new Date(iso).toISOString();
}

/** "2:00 PM", or "Oct 6, 2:00 PM" when it isn't today, in the laptop's zone. */
export function formatTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

/** "Calc HW (2:00 PM – 2:45 PM)" for error messages, in the laptop's zone. */
export function describeSession(title: string, session: Pick<TimeSession, 'startAt' | 'endAt'>) {
  const end = session.endAt
    ? new Date(session.endAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : 'now';
  return `${title} (${formatTime(session.startAt)} – ${end})`;
}
