import { describe, expect, it } from 'vitest';
import { behindPlan, diffPlans, type PlanSpan } from './changes';

const at = (hhmm: string) => `2026-10-05T${hhmm}:00.000Z`;
const span = (taskId: string, from: string, to: string): PlanSpan => ({
  taskId,
  startAt: at(from),
  endAt: at(to),
});
const titles: Record<string, string> = { a: 'Calc HW', b: 'Chem reading', c: 'Essay' };
const titleOf = (id: string) => titles[id] ?? '?';

describe('diffPlans', () => {
  it('lists nothing when every block is where it was', () => {
    const plan = [span('a', '13:00', '14:30'), span('b', '15:00', '16:00')];
    expect(diffPlans(plan, [...plan].reverse(), titleOf)).toEqual([]);
  });

  it('reports moved, added and removed tasks in time order', () => {
    const before = [
      span('a', '13:00', '14:30'),
      span('b', '15:00', '16:00'),
      span('b', '18:00', '19:00'),
      span('c', '20:00', '21:00'),
    ];
    const after = [
      span('a', '13:30', '15:00'),
      span('b', '18:00', '19:00'),
      span('b', '15:10', '16:10'),
      span('d', '17:00', '17:30'),
    ];
    expect(diffPlans(before, after, titleOf)).toEqual([
      {
        taskId: 'a',
        title: 'Calc HW',
        kind: 'moved',
        from: at('13:00'),
        to: at('13:30'),
        minutes: 90,
      },
      {
        taskId: 'b',
        title: 'Chem reading',
        kind: 'moved',
        from: at('15:00'),
        to: at('15:10'),
        minutes: 120,
      },
      { taskId: 'd', title: '?', kind: 'added', from: null, to: at('17:00'), minutes: 30 },
      { taskId: 'c', title: 'Essay', kind: 'removed', from: at('20:00'), to: null, minutes: 60 },
    ]);
  });

  it('counts a shortened block as moved in place', () => {
    const [change] = diffPlans(
      [span('a', '13:00', '14:30')],
      [span('a', '13:00', '14:00')],
      titleOf,
    );
    expect(change).toMatchObject({
      kind: 'moved',
      from: at('13:00'),
      to: at('13:00'),
      minutes: 60,
    });
  });
});

describe('behindPlan', () => {
  const block = { id: 'blk', ...span('a', '13:00', '14:30') };
  const behind = (now: string, sessions: Parameters<typeof behindPlan>[0]['sessions'] = []) =>
    behindPlan({ now: new Date(at(now)), graceMin: 10, blocks: [block], sessions });

  it('waits out the grace', () => {
    expect(behind('13:09')).toBeNull();
    expect(behind('13:10')).toEqual({ block, sinceAt: at('13:00'), lateMin: 10, stopped: false });
    expect(behind('13:25')?.lateMin).toBe(25);
  });

  it('is not behind while the task is being timed, or outside the block', () => {
    expect(behind('13:30', [{ taskId: 'a', startAt: at('13:20'), endAt: null }])).toBeNull();
    expect(behind('12:59')).toBeNull();
    expect(behind('14:30')).toBeNull();
  });

  it('counts from when work stopped during the block', () => {
    const sessions = [
      { taskId: 'a', startAt: at('12:50'), endAt: at('13:20') },
      { taskId: 'b', startAt: at('13:20'), endAt: at('13:40') },
    ];
    expect(behind('13:25', sessions)).toBeNull();
    expect(behind('13:45', sessions)).toEqual({
      block,
      sinceAt: at('13:20'),
      lateMin: 25,
      stopped: true,
    });
  });

  it('picks the block that is furthest behind', () => {
    const other = { id: 'other', ...span('b', '13:20', '15:00') };
    const out = behindPlan({
      now: new Date(at('13:40')),
      graceMin: 10,
      blocks: [other, block],
      sessions: [],
    });
    expect(out?.block.id).toBe('blk');
  });
});
