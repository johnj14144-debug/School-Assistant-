import type { PlanChange, PlanRun, PlanWarning } from '@sa/core';
import { beforeAll, describe, expect, it } from 'vitest';

let text: typeof import('./planText');
beforeAll(async () => {
  process.env.TZ = 'America/Chicago';
  text = await import('./planText');
});

const run = (fields: Partial<PlanRun> = {}): PlanRun => ({
  at: '2026-10-05T13:05:00.000Z',
  from: '2026-10-05T13:05:00.000Z',
  until: '2026-10-12T05:00:00.000Z',
  blockCount: 23,
  plannedMin: 1880,
  warnings: [],
  trigger: 'plan',
  fallback: 'none',
  changes: [],
  ...fields,
});

const warning = (kind: PlanWarning['kind'], title: string): PlanWarning => ({
  kind,
  taskId: '00000000-0000-4000-8000-000000000001',
  title,
  dueAt: '2026-10-09T04:59:00.000Z',
  minutes: 0,
  message: '',
  options: [],
});

describe('planner text', () => {
  it('sums up a run through its last day', () => {
    expect(text.runSummary(run())).toBe('Planned 23 blocks, 31h 20m of work, through Sun, Oct 11.');
    expect(text.runSummary(run({ blockCount: 1, plannedMin: 60 }))).toBe(
      'Planned 1 block, 1h of work, through Sun, Oct 11.',
    );
    expect(text.runSummary(run({ blockCount: 0, plannedMin: 0 }))).toBe(
      'Nothing to plan through Sun, Oct 11.',
    );
  });

  it('says when it planned', () => {
    expect(text.plannedAt(run(), new Date('2026-10-05T20:00:00.000Z'))).toBe('Planned at 8:05 AM');
    expect(text.plannedAt(run(), new Date('2026-10-06T20:00:00.000Z'))).toBe(
      'Planned Oct 5, 8:05 AM',
    );
  });

  it('says when and why it re-planned', () => {
    const now = new Date('2026-10-05T20:00:00.000Z');
    expect(text.plannedAt(run({ trigger: 'finish' }), now)).toBe(
      'Re-planned at 8:05 AM after a task ended early',
    );
    expect(text.plannedAt(run({ trigger: 'manual' }), now)).toBe('Re-planned at 8:05 AM');
    expect(text.plannedAt(run({ trigger: 'overrun' }), now)).toBe(
      'Re-planned at 8:05 AM as a task ran over',
    );
  });

  it('lists what a re-plan changed', () => {
    const now = new Date('2026-10-05T14:00:00.000Z');
    const change = (fields: Partial<PlanChange>): PlanChange => ({
      taskId: '00000000-0000-4000-8000-000000000001',
      title: 'Calc HW',
      kind: 'moved',
      from: '2026-10-05T14:00:00.000Z',
      to: '2026-10-05T14:30:00.000Z',
      minutes: 90,
      ...fields,
    });
    expect(text.changeText(change({}), now)).toBe('Calc HW: 9:00 AM → 9:30 AM');
    expect(text.changeText(change({ to: '2026-10-08T19:00:00.000Z' }), now)).toBe(
      'Calc HW: 9:00 AM → Thu 2:00 PM',
    );
    expect(text.changeText(change({ to: '2026-10-05T14:00:00.000Z' }), now)).toBe(
      'Calc HW: 9:00 AM block changed length',
    );
    expect(text.changeText(change({ kind: 'added', from: null }), now)).toBe(
      'Calc HW: planned 9:30 AM',
    );
    expect(text.changeText(change({ kind: 'removed', to: null }), now)).toBe(
      'Calc HW: no longer planned at 9:00 AM',
    );

    const changes = Array.from({ length: 6 }, (_, i) => change({ title: `Task ${i}` }));
    expect(text.replanToast(run({ trigger: 'edit', changes }), now)).toEqual({
      heading: 'Plan updated after a change',
      lines: [
        'Task 0: 9:00 AM → 9:30 AM',
        'Task 1: 9:00 AM → 9:30 AM',
        'Task 2: 9:00 AM → 9:30 AM',
        'Task 3: 9:00 AM → 9:30 AM',
        'and 2 more',
      ],
    });
    // An automatic re-plan that changed nothing is no news; "Re-plan now" always answers.
    expect(text.replanToast(run({ trigger: 'edit' }), now)).toBeNull();
    expect(text.replanToast(run({ trigger: 'manual' }), now)).toEqual({
      heading: 'Re-planned: nothing had to move.',
      lines: [],
    });
  });

  it('says how far behind the plan is', () => {
    const behind = {
      blockId: '00000000-0000-4000-8000-000000000002',
      taskId: '00000000-0000-4000-8000-000000000001',
      title: 'Calc HW',
      plannedStartAt: '2026-10-05T14:00:00.000Z',
      sinceAt: '2026-10-05T14:00:00.000Z',
      lateMin: 25,
      stopped: false,
    };
    expect(text.behindText(behind)).toBe('Calc HW should have started 25 min ago.');
    expect(text.behindText({ ...behind, lateMin: 75, stopped: true })).toBe(
      'Calc HW was planned for now, but it stopped 1h 15m ago.',
    );
  });

  it('groups warnings by what the user can do about them', () => {
    const groups = text.groupWarnings([
      warning('short', 'A'),
      warning('late', 'C'),
      warning('overdue', 'D'),
      warning('spent', 'E'),
      warning('unplaced', 'F'),
    ]);
    expect({
      problems: groups.problems.map((w) => w.title),
      late: groups.late.map((w) => w.title),
      unplanned: groups.unplanned.map((w) => w.title),
    }).toEqual({ problems: ['A', 'D', 'F'], late: ['C'], unplanned: ['E'] });
  });
});
