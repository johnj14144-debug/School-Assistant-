import { randomUUID } from 'node:crypto';
import {
  type Block,
  behindPlan,
  diffPlans,
  expandFixedEvents,
  isBackgroundBlock,
  type PlanBehind,
  type PlanKept,
  type PlannedBlock,
  type PlanRun,
  type PlanTrigger,
  type PlanWarning,
  type PreviousBlock,
  planHorizon,
  planWeek,
  preparePlan,
  replan,
  type Task,
} from '@sa/core';
import { and, eq, gt, gte, inArray, lt, lte } from 'drizzle-orm';
import type { PlannerPreferences } from '../../../shared/ipc';
import type { Db } from '../../db/database';
import { blocks, fixedEvents } from '../../db/schema';
import type { SettingsService } from '../../db/settings';
import type { Logger } from '../../log';
import { loadSnapshot, type TaskSnapshot } from '../tasks/snapshot';
import type { PlanEvent } from './events';

export interface PlannerDeps {
  db: Db;
  settings: SettingsService;
  now?: () => Date;
  newId?: () => string;
  /** The laptop's zone: days, and times in reasons and warnings. */
  displayZone?: () => string;
  /** Called after the plan's blocks change (the calendar and Today reload). */
  onChange?: () => void;
  /** Called after every re-plan (not "Plan my week") with what it did, for the toast. */
  onReplan?: (run: PlanRun) => void;
  /** Runs `task` after `ms` and returns a cancel function (automatic re-plans wait a moment). */
  schedule?: (task: () => void, ms: number) => () => void;
  log?: Logger;
}

const MINUTE_MS = 60_000;
const SLOT_MS = 5 * MINUTE_MS;
const PLAN_DAYS = 7;
/** Changes this close together make one automatic re-plan. */
const SETTLE_MS = 1000;
/** A timer running past its block extends the block this far past now, a step at a time. */
const OVERRUN_STEP_MIN = 15;
/** How long a planned block may go unworked before Today says the plan is behind (Q13). */
export const BEHIND_GRACE_MIN = 10;
const OVERRUN_NOTE = 'Ran over: it grows while the timer keeps going.';
const WARNING_ORDER: Record<PlanWarning['kind'], number> = {
  overdue: 0,
  short: 1,
  unplaced: 2,
  late: 3,
  spent: 4,
};

/** The blocks from now on, by what a plan may do with them. */
interface Sorted {
  /** Stay where they are: placed or moved by hand, locked, or under way. */
  frozen: Block[];
  /** The planner's own unlocked blocks that haven't started: a plan may keep or move them. */
  movable: Block[];
  /** Under way but their task isn't being timed (a late start): "Re-plan now" moves them. */
  missed: Block[];
}

const defaultSchedule = (task: () => void, ms: number) => {
  const handle = setTimeout(task, ms);
  return () => clearTimeout(handle);
};

/**
 * The planner (ADR 0011, ADR 0012). "Plan my week" makes a fresh plan from now to the end of the
 * seventh day; a re-plan keeps what still works of the last plan and moves only what it must.
 * Blocks placed or moved by hand, locked blocks and blocks under way never move; they count as
 * planned time for their task.
 *
 * Once a plan exists, the plan follows changes on its own (M6): task and calendar edits re-plan
 * (`notify`), finishing or stopping a task early ends its block and re-packs the rest of the
 * day (Q12), and a timer running past its block extends it and pushes what follows (`tick`). A
 * late start only shows as `behind()` until the user asks for "Re-plan now" (Q13).
 */
export class PlannerService {
  private readonly db: Db;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly displayZone: () => string;
  private readonly changed: () => void;
  private readonly schedule: (task: () => void, ms: number) => () => void;
  /** The automatic re-plan waiting for changes to settle, if any. */
  private pending: { trigger: 'edit' | 'finish'; cancel: () => void } | null = null;

  constructor(private readonly deps: PlannerDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? randomUUID;
    this.displayZone = deps.displayZone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    this.changed = deps.onChange ?? (() => {});
    this.schedule = deps.schedule ?? defaultSchedule;
  }

  /** "Plan my week": a fresh plan for the planner's blocks from now on. */
  planWeek(): PlanRun {
    return this.run('plan');
  }

  /**
   * Re-plans from now, keeping what still works. "Re-plan now" (`manual`) also moves a block
   * that should have started but didn't: its task gets the first free time.
   */
  replan(trigger: Exclude<PlanTrigger, 'plan'> = 'manual', options: { repack?: boolean } = {}) {
    return this.run(trigger, options.repack ?? false);
  }

  /** Removes the planner's blocks from now on (not locked or under way ones). */
  clear(): { removed: number } {
    this.cancelPending();
    const nowIso = this.now().toISOString();
    const where = and(
      eq(blocks.source, 'planner'),
      eq(blocks.locked, false),
      gte(blocks.startAt, nowIso),
    );
    const removed = this.db.select({ id: blocks.id }).from(blocks).where(where).all().length;
    this.db.delete(blocks).where(where).run();
    this.deps.settings.set('planner.lastRun', null);
    this.changed();
    return { removed };
  }

  lastRun(): PlanRun | null {
    return this.deps.settings.get('planner.lastRun');
  }

  // Following changes (M6)

  /**
   * A change that affects the plan. With a plan in place, it re-plans once changes settle; a
   * finished or stopped task's block ends right away, and the rest of the day is re-packed.
   */
  notify = (event: PlanEvent): void => {
    if (!this.lastRun()) return;
    if (event.kind === 'finish') this.finish(event.taskIds, event.at);
    const trigger =
      event.kind === 'finish' || this.pending?.trigger === 'finish' ? 'finish' : 'edit';
    this.pending?.cancel();
    this.pending = { trigger, cancel: this.schedule(() => void this.flush(), SETTLE_MS) };
  };

  /** Runs the waiting automatic re-plan now, if any. */
  flush(): PlanRun | null {
    const trigger = this.pending?.trigger;
    this.cancelPending();
    if (!trigger || !this.lastRun()) return null;
    return this.safely('Automatic re-plan', () => this.run(trigger, trigger === 'finish'));
  }

  /**
   * Called every minute: a focus timer still running after its block ended extends that block
   * (15 minutes past now, never into the routine or blocks that can't move), and the plan
   * re-plans around it, so the overrun pushes later work.
   */
  tick(): PlanRun | null {
    if (!this.lastRun()) return null;
    return this.safely('Overrun check', () => this.overrun());
  }

  /** A planned work block under way whose task hasn't been worked on for the grace (Q13). */
  behind(): PlanBehind | null {
    const now = this.now();
    const nowIso = now.toISOString();
    const rows = this.db
      .select()
      .from(blocks)
      .where(
        and(
          eq(blocks.source, 'planner'),
          eq(blocks.locked, false),
          eq(blocks.kind, 'work'),
          lte(blocks.startAt, nowIso),
          gt(blocks.endAt, nowIso),
        ),
      )
      .all();
    if (rows.length === 0) return null;
    const snap = loadSnapshot(this.db, now);
    const found = behindPlan({
      now,
      graceMin: BEHIND_GRACE_MIN,
      blocks: rows.flatMap((b) => {
        const task = b.taskId ? snap.byId.get(b.taskId) : undefined;
        if (task?.status !== 'open' || task.attention === 'background') return [];
        return [{ id: b.id, taskId: task.id, startAt: b.startAt, endAt: b.endAt }];
      }),
      sessions: snap.sessions,
    });
    if (!found) return null;
    return {
      blockId: found.block.id,
      taskId: found.block.taskId,
      title: snap.byId.get(found.block.taskId)?.title ?? '',
      plannedStartAt: found.block.startAt,
      sinceAt: found.sinceAt,
      lateMin: found.lateMin,
      stopped: found.stopped,
    };
  }

  preferences(): PlannerPreferences {
    const { settings } = this.deps;
    return {
      maxChunkMin: settings.get('planner.maxChunkMin'),
      breakMin: settings.get('planner.breakMin'),
      defaultEstimateMin: settings.get('planner.defaultEstimateMin'),
    };
  }

  setPreferences(prefs: Partial<PlannerPreferences>): PlannerPreferences {
    const { settings } = this.deps;
    if (prefs.maxChunkMin !== undefined) settings.set('planner.maxChunkMin', prefs.maxChunkMin);
    if (prefs.breakMin !== undefined) settings.set('planner.breakMin', prefs.breakMin);
    if (prefs.defaultEstimateMin !== undefined) {
      settings.set('planner.defaultEstimateMin', prefs.defaultEstimateMin);
    }
    return this.preferences();
  }

  // Planning

  private run(trigger: PlanTrigger, repack = false): PlanRun {
    this.cancelPending();
    const now = this.now();
    const nowIso = now.toISOString();
    const zone = this.displayZone();
    const { until } = planHorizon(now, zone, PLAN_DAYS);
    const { settings } = this.deps;
    const fresh = trigger === 'plan';

    const snap = loadSnapshot(this.db, now);
    const future = this.db.select().from(blocks).where(gt(blocks.endAt, nowIso)).all();
    const { frozen, movable, missed } = sortBlocks(future, snap, nowIso, trigger === 'manual');

    const keptMin = new Map<string, number>();
    for (const b of frozen) {
      if (!b.taskId) continue;
      const start = Math.max(Date.parse(b.startAt), now.getTime());
      const minutes = (Date.parse(b.endAt) - start) / MINUTE_MS;
      keptMin.set(b.taskId, (keptMin.get(b.taskId) ?? 0) + minutes);
    }
    const prepared = preparePlan({
      tasks: snap.tasks,
      actualMin: snap.rollup,
      keptMin,
      defaultEstimateMin: settings.get('planner.defaultEstimateMin'),
      until,
    });
    const occurrences = expandFixedEvents(this.db.select().from(fixedEvents).all(), now, until, {
      sleepFloorMin: settings.get('calendar.sleepFloorMin'),
    });
    const running = snap
      .openSessions()
      .find((s) => snap.byId.get(s.taskId)?.attention !== 'background');
    // Work the user just finished earns its break too (finishing early, then re-packing).
    const breakMin = settings.get('planner.breakMin');
    const justWorked = snap.sessions.filter(
      (s) =>
        s.endAt !== null &&
        !snap.isBackground(s.taskId) &&
        Date.parse(s.endAt) > now.getTime() - breakMin * MINUTE_MS,
    );
    const input = {
      now,
      until,
      timeZone: zone,
      tasks: prepared.tasks,
      fixed: occurrences.map((o) => ({ kind: o.event.kind, startAt: o.startAt, endAt: o.endAt })),
      kept: [
        ...frozen.map((b) => ({
          startAt: b.startAt,
          endAt: b.endAt,
          mode: keptMode(b, b.taskId ? snap.byId.get(b.taskId) : undefined),
        })),
        ...justWorked.map((s) => ({
          startAt: s.startAt,
          endAt: s.endAt as string,
          mode: 'work' as const,
        })),
      ],
      runningTaskId: running?.taskId ?? null,
      settings: { maxChunkMin: settings.get('planner.maxChunkMin'), breakMin },
    };
    const outcome = fresh
      ? { ...planWeek(input), fallback: 'none' as const }
      : replan({
          ...input,
          previous: movable.flatMap((b): PreviousBlock[] =>
            b.taskId ? [{ ...b, taskId: b.taskId }] : [],
          ),
          // The rest of today, up to midnight.
          repackUntil: repack ? planHorizon(now, zone, 1).until : null,
          startNowTaskId: missed[0]?.taskId ?? null,
        });

    this.save(outcome.blocks, movable, missed, snap, nowIso);
    const titleOf = (id: string) => snap.byId.get(id)?.title ?? 'A task';
    const run: PlanRun = {
      at: nowIso,
      from: outcome.from,
      until: until.toISOString(),
      blockCount: outcome.blocks.length,
      plannedMin: Math.round(
        outcome.blocks
          .filter((b) => {
            const task = snap.byId.get(b.taskId);
            return !isBackgroundBlock(b.kind, task?.attention ?? null);
          })
          .reduce((sum, b) => sum + (Date.parse(b.endAt) - Date.parse(b.startAt)) / MINUTE_MS, 0),
      ),
      warnings: [...outcome.warnings, ...prepared.warnings].sort(
        (a, b) =>
          WARNING_ORDER[a.kind] - WARNING_ORDER[b.kind] ||
          a.dueAt.localeCompare(b.dueAt) ||
          a.title.localeCompare(b.title),
      ),
      trigger,
      fallback: outcome.fallback,
      // A finished task's blocks going away is no news.
      changes: fresh
        ? []
        : diffPlans([...movable, ...missed].flatMap(span), outcome.blocks, titleOf).filter(
            (c) => !(c.kind === 'removed' && snap.byId.get(c.taskId)?.status !== 'open'),
          ),
    };
    settings.set('planner.lastRun', run);
    this.changed();
    if (!fresh) this.deps.onReplan?.(run);
    return run;
  }

  /**
   * Writes a plan: blocks it keeps stay the same rows (shortened if need be), identical new
   * blocks reuse old rows, the rest of the movable blocks go. A missed block is trimmed to now if
   * its task was worked on during it (that time happened), and removed otherwise.
   */
  private save(
    planned: readonly PlannedBlock[],
    movable: readonly Block[],
    missed: readonly Block[],
    snap: TaskSnapshot,
    stamp: string,
  ): void {
    const byId = new Map(movable.map((b) => [b.id, b]));
    const claimed = new Set<string>();
    for (const p of planned) if (p.previousId && byId.has(p.previousId)) claimed.add(p.previousId);
    const same = new Map<string, Block>();
    for (const b of movable) if (!claimed.has(b.id)) same.set(sameKey(b), b);
    const updates: { row: Block; block: PlannedBlock }[] = [];
    const inserts: Block[] = [];
    for (const p of planned) {
      let row = p.previousId ? byId.get(p.previousId) : undefined;
      if (!row) {
        row = same.get(sameKey(p));
        if (row) {
          same.delete(sameKey(p));
          claimed.add(row.id);
        }
      }
      if (row) {
        updates.push({ row, block: p });
        continue;
      }
      inserts.push({
        id: this.newId(),
        taskId: p.taskId,
        title: p.title,
        startAt: p.startAt,
        endAt: p.endAt,
        locked: false,
        source: 'planner',
        kind: p.kind,
        reason: p.reason,
        createdAt: stamp,
        updatedAt: stamp,
      });
    }
    const removed = movable.filter((b) => !claimed.has(b.id)).map((b) => b.id);
    this.db.transaction((tx) => {
      if (removed.length > 0) tx.delete(blocks).where(inArray(blocks.id, removed)).run();
      for (const { row, block } of updates) {
        if (
          row.startAt === block.startAt &&
          row.endAt === block.endAt &&
          row.reason === block.reason
        )
          continue;
        tx.update(blocks)
          .set({
            startAt: block.startAt,
            endAt: block.endAt,
            reason: block.reason,
            updatedAt: stamp,
          })
          .where(eq(blocks.id, row.id))
          .run();
      }
      for (const b of missed) {
        const worked = snap.sessions.some(
          (s) => s.taskId === b.taskId && s.startAt < stamp && (s.endAt ?? stamp) > b.startAt,
        );
        if (worked) {
          tx.update(blocks)
            .set({ endAt: stamp, updatedAt: stamp })
            .where(eq(blocks.id, b.id))
            .run();
        } else tx.delete(blocks).where(eq(blocks.id, b.id)).run();
      }
      for (const row of inserts) tx.insert(blocks).values(row).run();
    });
  }

  /** Ends the tasks' work blocks under way at `at` (finished or stopped early, Q12). */
  private finish(taskIds: readonly string[], at: string): void {
    if (taskIds.length === 0) return;
    const rows = this.db
      .select({ id: blocks.id })
      .from(blocks)
      .where(
        and(
          inArray(blocks.taskId, [...taskIds]),
          eq(blocks.locked, false),
          eq(blocks.kind, 'work'),
          lt(blocks.startAt, at),
          gt(blocks.endAt, at),
        ),
      )
      .all();
    if (rows.length === 0) return;
    const stamp = this.now().toISOString();
    this.db.transaction((tx) => {
      for (const { id } of rows) {
        tx.update(blocks).set({ endAt: at, updatedAt: stamp }).where(eq(blocks.id, id)).run();
      }
    });
    this.changed();
  }

  private overrun(): PlanRun | null {
    const now = this.now();
    const nowIso = now.toISOString();
    const snap = loadSnapshot(this.db, now);
    const focus = snap
      .openSessions()
      .filter((s) => !snap.isBackground(s.taskId))
      .at(-1);
    if (!focus) return null;
    const mine = this.db
      .select()
      .from(blocks)
      .where(and(eq(blocks.taskId, focus.taskId), eq(blocks.kind, 'work')))
      .all();
    if (mine.some((b) => b.startAt <= nowIso && b.endAt > nowIso)) return null;
    // The block that ended while the timer was running.
    const [last] = mine
      .filter((b) => !b.locked && b.endAt <= nowIso && b.endAt > focus.startAt)
      .sort((a, b) => b.endAt.localeCompare(a.endAt));
    if (!last) return null;
    const from = Date.parse(last.endAt);
    const target = Math.ceil(now.getTime() / SLOT_MS) * SLOT_MS + OVERRUN_STEP_MIN * MINUTE_MS;
    const end = Math.min(target, this.nextObstacle(from, target, snap, nowIso, last.id));
    if (end <= from) return null;
    this.db
      .update(blocks)
      .set({
        endAt: new Date(end).toISOString(),
        reason: last.reason.includes(OVERRUN_NOTE)
          ? last.reason
          : `${last.reason} ${OVERRUN_NOTE}`.trim(),
        updatedAt: nowIso,
      })
      .where(eq(blocks.id, last.id))
      .run();
    return this.run('overrun');
  }

  /**
   * The first time in [fromMs, toMs) that an overrunning block can't grow into: a routine item,
   * or a block that stays (by hand, locked, under way) and needs the user.
   */
  private nextObstacle(
    fromMs: number,
    toMs: number,
    snap: TaskSnapshot,
    nowIso: string,
    selfId: string,
  ): number {
    const fromIso = new Date(fromMs).toISOString();
    const toIso = new Date(toMs).toISOString();
    let limit = toMs;
    const occurrences = expandFixedEvents(
      this.db.select().from(fixedEvents).all(),
      fromIso,
      toIso,
      {
        sleepFloorMin: this.deps.settings.get('calendar.sleepFloorMin'),
      },
    );
    for (const o of occurrences) limit = Math.min(limit, Math.max(fromMs, Date.parse(o.startAt)));
    const others = this.db
      .select()
      .from(blocks)
      .where(and(lt(blocks.startAt, toIso), gt(blocks.endAt, fromIso)))
      .all();
    for (const b of others) {
      if (b.id === selfId) continue;
      const movable = b.source === 'planner' && !b.locked && b.startAt >= nowIso;
      const task = b.taskId ? snap.byId.get(b.taskId) : undefined;
      if (movable || isBackgroundBlock(b.kind, task?.attention ?? null)) continue;
      limit = Math.min(limit, Math.max(fromMs, Date.parse(b.startAt)));
    }
    return limit;
  }

  private cancelPending(): void {
    this.pending?.cancel();
    this.pending = null;
  }

  /** Runs work started by a timer: a failure is logged, not thrown into the event loop. */
  private safely<T>(what: string, work: () => T): T | null {
    try {
      return work();
    } catch (error) {
      this.deps.log?.error(`${what} failed`, error);
      return null;
    }
  }
}

/**
 * Frozen, movable or missed (see `Sorted`). Missed blocks are only told apart when "Re-plan now"
 * will move them; otherwise they stay as they are. A sequence under way (the washer running)
 * stays whole: none of its blocks move.
 */
function sortBlocks(
  future: readonly Block[],
  snap: TaskSnapshot,
  nowIso: string,
  moveMissed: boolean,
): Sorted {
  const frozen: Block[] = [];
  const movable: Block[] = [];
  const missed: Block[] = [];
  for (const b of future) {
    const task = b.taskId ? snap.byId.get(b.taskId) : undefined;
    if (b.source !== 'planner' || b.locked) frozen.push(b);
    else if (b.startAt >= nowIso) movable.push(b);
    else if (
      moveMissed &&
      task?.status === 'open' &&
      b.kind === 'work' &&
      task.attention !== 'background' &&
      !snap.running.has(task.id)
    ) {
      missed.push(b);
    } else frozen.push(b);
  }
  const hasSteps = (b: Block) =>
    b.taskId !== null && (snap.byId.get(b.taskId)?.steps.length ?? 0) > 0;
  const underWay = new Set(frozen.filter(hasSteps).map((b) => b.taskId));
  const stays = (b: Block) => underWay.has(b.taskId);
  return {
    frozen: [...frozen, ...movable.filter(stays)],
    movable: movable.filter((b) => !stays(b)),
    missed: missed.sort((a, b) => a.startAt.localeCompare(b.startAt)),
  };
}

/** How a block that stays affects the plan: work needs breaks, a wait runs alongside. */
function keptMode(block: Block, task: Task | undefined): PlanKept['mode'] {
  if (isBackgroundBlock(block.kind, task?.attention ?? null)) return 'background';
  return task && block.kind === 'work' ? 'work' : 'busy';
}

const span = (b: Block) =>
  b.taskId ? [{ taskId: b.taskId, startAt: b.startAt, endAt: b.endAt }] : [];
const sameKey = (b: Pick<Block, 'taskId' | 'kind' | 'startAt' | 'endAt'>) =>
  `${b.taskId}|${b.kind}|${b.startAt}|${b.endAt}`;
