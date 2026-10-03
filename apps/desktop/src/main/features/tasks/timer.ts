import { randomUUID } from 'node:crypto';
import {
  findConflict,
  planStart,
  type SessionSpan,
  type sessionCreateSchema,
  sessionMinutes,
  type sessionUpdateSchema,
  type TimerEntry,
  type TimerState,
  type TimeSession,
} from '@sa/core';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import type { Db } from '../../db/database';
import { timeSessions } from '../../db/schema';
import type { SettingsService } from '../../db/settings';
import type { TasksService } from './service';
import {
  describeSession,
  formatTime,
  loadSnapshot,
  normalizeInstant,
  type TaskSnapshot,
} from './snapshot';

/** Typed times may be a little ahead of the main process's clock. */
const CLOCK_GRACE_MS = 60_000;

export interface TimerDeps {
  db: Db;
  settings: SettingsService;
  tasks: TasksService;
  now?: () => Date;
  newId?: () => string;
  onChange?: () => void;
}

/**
 * The task timer. One focus/light task runs at a time (starting another stops it at that
 * moment); background tasks run alongside. Open sessions live in the database, so a running
 * timer survives a restart. Pausing closes the session and remembers the task to resume.
 */
export class TimerService {
  private readonly db: Db;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly changed: () => void;

  constructor(private readonly deps: TimerDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? randomUUID;
    this.changed = deps.onChange ?? (() => {});
  }

  state(): TimerState {
    const now = this.now();
    const snap = loadSnapshot(this.db, now);
    const entry = (session: TimeSession): TimerEntry | null => {
      const task = snap.byId.get(session.taskId);
      if (!task) return null;
      const total = snap.rollup.get(task.id) ?? 0;
      return { task: snap.item(task), session, priorMin: total - sessionMinutes(session, now) };
    };
    const open = snap.openSessions();
    const focus = open.filter((s) => !snap.isBackground(s.taskId)).at(-1);
    const background = open.filter((s) => snap.isBackground(s.taskId));
    const pausedId = this.deps.settings.get('timer.paused')?.taskId;
    const pausedTask = pausedId ? snap.byId.get(pausedId) : undefined;
    const paused =
      pausedTask && pausedTask.status === 'open' && !snap.running.has(pausedTask.id)
        ? {
            task: snap.item(pausedTask),
            session: null,
            priorMin: snap.rollup.get(pausedTask.id) ?? 0,
          }
        : null;
    return {
      focus: focus ? entry(focus) : null,
      paused,
      background: background.flatMap((s) => entry(s) ?? []),
    };
  }

  /**
   * Starts timing a task now, or at `startAt` ("I started at…"). Starting a focus task stops
   * the running one at that moment. For a task that is already running, `startAt` moves its
   * start.
   */
  start(taskId: string, startAt?: string): TimerState {
    const task = this.deps.tasks.require(taskId);
    if (task.status === 'done') {
      throw new Error(`"${task.title}" is done. Reopen it to time more work on it.`);
    }
    const now = this.now();
    const at = startAt ? this.notInFuture(startAt, now, 'start') : now.toISOString();
    const snap = loadSnapshot(this.db, now);
    const plan = planStart(taskId, at, this.rules(snap));
    switch (plan.kind) {
      case 'running':
        if (startAt) return this.updateSession({ id: plan.session.id, startAt: at });
        return this.state();
      case 'before-running': {
        const title = snap.byId.get(plan.session.taskId)?.title ?? 'The running task';
        throw new Error(
          `That's before ${title} started (${formatTime(plan.session.startAt)}). Pick a later ` +
            'time, or edit that session first.',
        );
      }
      case 'overlap':
        throw this.overlapError(snap, plan.session);
      case 'ok':
        this.db.transaction((tx) => {
          for (const s of plan.close) this.closeAt(s, at, tx);
          tx.insert(timeSessions)
            .values({ id: this.newId(), taskId, startAt: at, endAt: null, source: 'desktop' })
            .run();
        });
    }
    if (!snap.isBackground(taskId)) this.deps.settings.set('timer.paused', null);
    this.changed();
    return this.state();
  }

  /** Stops the focus timer and remembers the task, so Resume picks it up again. */
  pause(): TimerState {
    const snap = loadSnapshot(this.db, this.now());
    const focus = snap
      .openSessions()
      .filter((s) => !snap.isBackground(s.taskId))
      .at(-1);
    if (!focus) throw new Error('No task is being timed.');
    this.closeAt(focus, this.now().toISOString());
    this.deps.settings.set('timer.paused', { taskId: focus.taskId });
    this.changed();
    return this.state();
  }

  resume(): TimerState {
    const paused = this.deps.settings.get('timer.paused');
    if (!paused) throw new Error('Nothing is paused.');
    return this.start(paused.taskId);
  }

  /**
   * Stops a task's timer (default: the focus task). With nothing running, it clears the paused
   * task instead.
   */
  stop(taskId?: string): TimerState {
    const snap = loadSnapshot(this.db, this.now());
    const open = snap.openSessions();
    const session = taskId
      ? open.find((s) => s.taskId === taskId)
      : open.filter((s) => !snap.isBackground(s.taskId)).at(-1);
    const paused = this.deps.settings.get('timer.paused');
    if (session) {
      this.closeAt(session, this.now().toISOString());
    } else if (paused && (!taskId || paused.taskId === taskId)) {
      this.deps.settings.set('timer.paused', null);
    } else {
      throw new Error('That timer is not running.');
    }
    this.changed();
    return this.state();
  }

  /** Adds time worked without the timer ("I did 1:00–2:30 yesterday"). */
  createSession({ taskId, startAt, endAt }: z.output<typeof sessionCreateSchema>): TimeSession {
    this.deps.tasks.require(taskId);
    const now = this.now();
    const start = this.notInFuture(startAt, now, 'start');
    const end = this.notInFuture(endAt, now, 'end');
    this.checkSession({ taskId, startAt: start, endAt: end });
    const session: TimeSession = {
      id: this.newId(),
      taskId,
      startAt: start,
      endAt: end,
      source: 'manual',
    };
    this.db.insert(timeSessions).values(session).run();
    this.changed();
    return session;
  }

  /** Moves a session's start or end. Setting the end of a running session stops it then. */
  updateSession({ id, startAt, endAt }: z.output<typeof sessionUpdateSchema>): TimerState {
    const session = this.requireSession(id);
    const now = this.now();
    const start = startAt ? this.notInFuture(startAt, now, 'start') : session.startAt;
    const end = endAt ? this.notInFuture(endAt, now, 'end') : session.endAt;
    this.checkSession({ id, taskId: session.taskId, startAt: start, endAt: end });
    this.db
      .update(timeSessions)
      .set({ startAt: start, endAt: end })
      .where(eq(timeSessions.id, id))
      .run();
    this.changed();
    return this.state();
  }

  deleteSession(id: string): void {
    this.requireSession(id);
    this.db.delete(timeSessions).where(eq(timeSessions.id, id)).run();
    this.changed();
  }

  private rules(snap: TaskSnapshot) {
    return { sessions: snap.sessions, isBackground: snap.isBackground };
  }

  private checkSession(candidate: Omit<SessionSpan, 'id'> & { id?: string }): void {
    if (candidate.endAt !== null && candidate.endAt <= candidate.startAt) {
      throw new Error('A session has to end after it starts.');
    }
    const snap = loadSnapshot(this.db, this.now());
    const conflict = findConflict(candidate, this.rules(snap));
    if (conflict) throw this.overlapError(snap, conflict);
  }

  private overlapError(snap: TaskSnapshot, other: SessionSpan): Error {
    const title = snap.byId.get(other.taskId)?.title ?? 'another task';
    return new Error(`That overlaps ${describeSession(title, other)}.`);
  }

  /** A normalized instant, no later than now (a minute of clock difference is forgiven). */
  private notInFuture(iso: string, now: Date, what: 'start' | 'end'): string {
    const time = Date.parse(iso);
    if (time > now.getTime() + CLOCK_GRACE_MS) {
      throw new Error(`The ${what} time can't be in the future.`);
    }
    return normalizeInstant(new Date(Math.min(time, now.getTime())).toISOString());
  }

  /** Ends a session; one that would end at or before its start is removed. */
  private closeAt(
    session: Pick<TimeSession, 'id' | 'startAt'>,
    at: string,
    db: Pick<Db, 'update' | 'delete'> = this.db,
  ) {
    if (at <= session.startAt) {
      db.delete(timeSessions).where(eq(timeSessions.id, session.id)).run();
    } else {
      db.update(timeSessions).set({ endAt: at }).where(eq(timeSessions.id, session.id)).run();
    }
  }

  private requireSession(id: string): TimeSession {
    const session = this.db.select().from(timeSessions).where(eq(timeSessions.id, id)).get();
    if (!session) throw new Error('Session not found');
    return session;
  }
}
