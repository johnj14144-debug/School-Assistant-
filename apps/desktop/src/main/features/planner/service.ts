import { randomUUID } from 'node:crypto';
import {
  type Block,
  expandFixedEvents,
  isBackgroundBlock,
  type PlanKept,
  type PlanRun,
  type PlanWarning,
  planHorizon,
  planWeek,
  preparePlan,
  type Task,
} from '@sa/core';
import { and, eq, gt, gte, inArray } from 'drizzle-orm';
import type { Db } from '../../db/database';
import { blocks, fixedEvents } from '../../db/schema';
import type { SettingsService } from '../../db/settings';
import { loadSnapshot } from '../tasks/snapshot';

export interface PlannerDeps {
  db: Db;
  settings: SettingsService;
  now?: () => Date;
  newId?: () => string;
  /** The laptop's zone: days, and times in reasons and warnings. */
  displayZone?: () => string;
  /** Called after the plan's blocks change (the calendar and Today reload). */
  onChange?: () => void;
}

const MINUTE_MS = 60_000;
const PLAN_DAYS = 7;
const WARNING_ORDER: Record<PlanWarning['kind'], number> = {
  overdue: 0,
  short: 1,
  unplaced: 2,
  late: 3,
  spent: 4,
  'no-estimate': 5,
};

/**
 * "Plan my week" (M5): replaces the planner's future blocks with a fresh plan from now to the
 * end of the seventh day. Blocks placed or moved by hand, locked blocks and blocks already under
 * way stay where they are and count as planned time for their task. The plan itself is core's
 * `planWeek` (ADR 0011).
 */
export class PlannerService {
  private readonly db: Db;
  private readonly now: () => Date;
  private readonly newId: () => string;
  private readonly displayZone: () => string;
  private readonly changed: () => void;

  constructor(private readonly deps: PlannerDeps) {
    this.db = deps.db;
    this.now = deps.now ?? (() => new Date());
    this.newId = deps.newId ?? randomUUID;
    this.displayZone = deps.displayZone ?? (() => Intl.DateTimeFormat().resolvedOptions().timeZone);
    this.changed = deps.onChange ?? (() => {});
  }

  planWeek(): PlanRun {
    const now = this.now();
    const nowIso = now.toISOString();
    const zone = this.displayZone();
    const { until } = planHorizon(now, zone, PLAN_DAYS);
    const { settings } = this.deps;

    const snap = loadSnapshot(this.db, now);
    const future = this.db.select().from(blocks).where(gt(blocks.endAt, nowIso)).all();
    const replaced = future.filter(
      (b) => b.source === 'planner' && !b.locked && b.startAt >= nowIso,
    );
    const replacedIds = new Set(replaced.map((b) => b.id));
    const kept = future.filter((b) => !replacedIds.has(b.id));

    const keptMin = new Map<string, number>();
    for (const b of kept) {
      if (!b.taskId) continue;
      const start = Math.max(Date.parse(b.startAt), now.getTime());
      const minutes = (Date.parse(b.endAt) - start) / MINUTE_MS;
      keptMin.set(b.taskId, (keptMin.get(b.taskId) ?? 0) + minutes);
    }
    const prepared = preparePlan({ tasks: snap.tasks, actualMin: snap.rollup, keptMin, until });
    const occurrences = expandFixedEvents(this.db.select().from(fixedEvents).all(), now, until, {
      sleepFloorMin: settings.get('calendar.sleepFloorMin'),
    });
    const running = snap
      .openSessions()
      .find((s) => snap.byId.get(s.taskId)?.attention !== 'background');

    const outcome = planWeek({
      now,
      until,
      timeZone: zone,
      tasks: prepared.tasks,
      fixed: occurrences.map((o) => ({ kind: o.event.kind, startAt: o.startAt, endAt: o.endAt })),
      kept: kept.map((b) => ({
        startAt: b.startAt,
        endAt: b.endAt,
        mode: keptMode(b, b.taskId ? snap.byId.get(b.taskId) : undefined),
      })),
      runningTaskId: running?.taskId ?? null,
      settings: {
        maxChunkMin: settings.get('planner.maxChunkMin'),
        breakMin: settings.get('planner.breakMin'),
      },
    });

    const stamp = nowIso;
    const rows: Block[] = outcome.blocks.map((b) => ({
      id: this.newId(),
      taskId: b.taskId,
      title: b.title,
      startAt: b.startAt,
      endAt: b.endAt,
      locked: false,
      source: 'planner',
      kind: b.kind,
      reason: b.reason,
      createdAt: stamp,
      updatedAt: stamp,
    }));
    this.db.transaction((tx) => {
      if (replacedIds.size > 0)
        tx.delete(blocks)
          .where(inArray(blocks.id, [...replacedIds]))
          .run();
      for (const row of rows) tx.insert(blocks).values(row).run();
    });

    const run: PlanRun = {
      at: stamp,
      from: outcome.from,
      until: until.toISOString(),
      blockCount: rows.length,
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
          (a.dueAt ?? '￿').localeCompare(b.dueAt ?? '￿') ||
          a.title.localeCompare(b.title),
      ),
    };
    settings.set('planner.lastRun', run);
    this.changed();
    return run;
  }

  /** Removes the planner's blocks from now on (not locked or under way ones). */
  clear(): { removed: number } {
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

  preferences(): { maxChunkMin: number; breakMin: number } {
    return {
      maxChunkMin: this.deps.settings.get('planner.maxChunkMin'),
      breakMin: this.deps.settings.get('planner.breakMin'),
    };
  }

  setPreferences(prefs: { maxChunkMin?: number; breakMin?: number }) {
    if (prefs.maxChunkMin !== undefined) {
      this.deps.settings.set('planner.maxChunkMin', prefs.maxChunkMin);
    }
    if (prefs.breakMin !== undefined) this.deps.settings.set('planner.breakMin', prefs.breakMin);
    return this.preferences();
  }
}

/** How a block that stays affects the plan: work needs breaks, a wait runs alongside. */
function keptMode(block: Block, task: Task | undefined): PlanKept['mode'] {
  if (isBackgroundBlock(block.kind, task?.attention ?? null)) return 'background';
  return task && block.kind === 'work' ? 'work' : 'busy';
}
