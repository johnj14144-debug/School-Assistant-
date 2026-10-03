import type { PlanRun, PlanWarning } from '@sa/core';
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
