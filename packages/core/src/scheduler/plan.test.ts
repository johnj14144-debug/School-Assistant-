import { describe, expect, it } from 'vitest';
import { type PlanInput, type PlannedBlock, planWeek, replan } from './plan';
import { fixedBetween, local, minutesOf, ms, overlaps, planTask, ZONE } from './test-fixtures';

// Mon Oct 5, 2026, 8:00 AM in Houston (breakfast just ended).
const NOW = '2026-10-05T13:00:00.000Z';
const UNTIL = '2026-10-12T05:00:00.000Z'; // the next Monday, midnight
const fixed = fixedBetween(NOW, UNTIL);

function plan(fields: Partial<PlanInput> = {}) {
  return planWeek({
    now: new Date(NOW),
    until: new Date(UNTIL),
    timeZone: ZONE,
    tasks: [],
    fixed,
    kept: [],
    ...fields,
  });
}

const spans = (blocks: PlannedBlock[], taskId?: string) =>
  blocks
    .filter((b) => taskId === undefined || b.taskId === taskId)
    .map((b) => `${local(b.startAt)}–${local(b.endAt).split(' ')[1]}`);

describe('planWeek', () => {
  it('plans nothing without tasks', () => {
    expect(plan()).toEqual({ blocks: [], warnings: [], from: NOW });
  });

  it('puts work in the first free time, with a reason', () => {
    const hw = planTask({ title: 'Calc HW 3', dueAt: '2026-10-07T04:59:00.000Z' });
    const { blocks, warnings } = plan({ tasks: [hw] });
    expect(warnings).toEqual([]);
    expect(blocks).toEqual([
      {
        taskId: hw.id,
        title: '',
        startAt: NOW,
        endAt: '2026-10-05T14:00:00.000Z',
        kind: 'work',
        reason: expect.stringContaining('Due Tue, Oct 6, 11:59 PM, with'),
      },
    ]);
    expect(blocks[0]?.reason).toContain('The earliest deadline among open work.');
  });

  it('starts at the next 5 minutes', () => {
    const { blocks, from } = plan({
      now: new Date('2026-10-05T13:02:10.000Z'),
      tasks: [planTask()],
    });
    expect(from).toBe('2026-10-05T13:05:00.000Z');
    expect(blocks[0]?.startAt).toBe('2026-10-05T13:05:00.000Z');
  });

  it('splits long work into chunks with breaks and numbers the parts', () => {
    const essay = planTask({ title: 'Essay', remainingMin: 240 });
    const { blocks } = plan({ tasks: [essay] });
    // 8:00–10:00 before MATH: 90 min, a break, then 20 min is too short; 10:50–12:00 before
    // CHEM; the last 80 min after it.
    expect(spans(blocks)).toEqual(['Mon 8:00–9:30', 'Mon 10:50–12:00', 'Mon 12:50–14:10']);
    expect(blocks.map(minutesOf)).toEqual([90, 70, 80]);
    expect(blocks[0]?.reason).toMatch(/^Part 1 of 3\. Due Thu, Dec 31, 5:59 PM, with /);
  });

  it('never leaves a sliver shorter than the minimum chunk', () => {
    const task = planTask({ remainingMin: 100, minChunkMin: 30 });
    const { blocks } = plan({ now: new Date('2026-10-05T18:00:00.000Z'), tasks: [task] });
    // 1:00 PM onward is free until dinner: 70 + 30, not 90 + 10.
    expect(blocks.map(minutesOf)).toEqual([70, 30]);
  });

  it('does the earliest deadline first', () => {
    const later = planTask({ subject: 'math', dueAt: '2026-10-09T22:00:00.000Z' });
    const sooner = planTask({ subject: 'math', dueAt: '2026-10-06T22:00:00.000Z' });
    const { blocks } = plan({ tasks: [later, sooner] });
    expect(blocks.map((b) => b.taskId)).toEqual([sooner.id, later.id]);
  });

  it('breaks ties by priority, then age', () => {
    const due = '2026-10-09T22:00:00.000Z';
    const low = planTask({ priority: 'low', dueAt: due, subject: 's' });
    const high = planTask({ priority: 'high', dueAt: due, subject: 's' });
    const normal = planTask({ dueAt: due, subject: 's' });
    const { blocks } = plan({ tasks: [low, normal, high] });
    expect(blocks.map((b) => b.taskId)).toEqual([high.id, normal.id, low.id]);
  });

  it('switches subjects when everything due sooner still fits', () => {
    const math = planTask({
      subject: 'math',
      remainingMin: 180,
      dueAt: '2026-10-09T22:00:00.000Z',
    });
    const chem = planTask({
      subject: 'chem',
      remainingMin: 180,
      dueAt: '2026-10-10T22:00:00.000Z',
    });
    // Mon 12:50 PM: free until dinner.
    const { blocks } = plan({ now: new Date('2026-10-05T17:50:00.000Z'), tasks: [math, chem] });
    expect(blocks.map((b) => (b.taskId === math.id ? 'M' : 'C')).join('')).toBe('MCMC');
    expect(spans(blocks)).toEqual([
      'Mon 12:50–14:20',
      'Mon 14:30–16:00',
      'Mon 16:10–17:40',
      'Mon 17:50–19:20',
    ]);
    expect(blocks[1]?.reason).toContain('A change of subject; everything due sooner still fits.');
  });

  it('uses a short gap for other work rather than cutting up work that fits in one block', () => {
    const math = planTask({ subject: 'math', remainingMin: 90, dueAt: '2026-10-09T22:00:00.000Z' });
    const reading = planTask({ subject: 'hist', remainingMin: 60 });
    // 10:50–12:00 is 70 minutes: too short for the 90-minute task, long enough for the reading.
    const { blocks } = plan({ now: new Date('2026-10-05T15:50:00.000Z'), tasks: [math, reading] });
    expect(spans(blocks)).toEqual(['Mon 10:50–11:50', 'Mon 12:50–14:20']);
    expect(blocks[0]?.reason).toContain('The most urgent work that fits this gap.');
  });

  it('keeps going on the same subject when a deadline needs it', () => {
    // Due Mon 6 PM with 7 h of work: Mon has 8 h 20 m of free time before then, too little to
    // share once breaks are paid for.
    const tight = planTask({
      subject: 'math',
      remainingMin: 420,
      dueAt: '2026-10-05T23:00:00.000Z',
    });
    const other = planTask({ subject: 'chem', remainingMin: 60 });
    const { blocks, warnings } = plan({ tasks: [tight, other] });
    expect(warnings).toEqual([]);
    const done = ms(blocks.filter((b) => b.taskId === tight.id).at(-1)?.endAt ?? '');
    expect(done).toBeLessThanOrEqual(ms('2026-10-05T23:00:00.000Z'));
    const before = blocks.filter((b) => ms(b.startAt) < done);
    expect(before.every((b) => b.taskId === tight.id)).toBe(true);
  });

  it('never plans over sleep, classes, meals or routine items', () => {
    const tasks = Array.from({ length: 12 }, (_, i) =>
      planTask({ subject: `c${i % 4}`, remainingMin: 400 }),
    );
    const { blocks } = plan({ tasks });
    expect(blocks.length).toBeGreaterThan(30);
    for (const b of blocks) {
      for (const f of fixed) expect(overlaps(b, f), `${local(b.startAt)} vs ${f.kind}`).toBe(false);
    }
  });

  it('keeps a break between work blocks', () => {
    const tasks = Array.from({ length: 6 }, (_, i) =>
      planTask({ subject: `c${i}`, remainingMin: 300 }),
    );
    const { blocks } = plan({ tasks });
    const sorted = blocks.toSorted((a, b) => a.startAt.localeCompare(b.startAt));
    for (let i = 1; i < sorted.length; i++) {
      const gap = (ms(sorted[i]?.startAt ?? '') - ms(sorted[i - 1]?.endAt ?? '')) / 60_000;
      expect(gap).toBeGreaterThanOrEqual(10);
    }
  });

  it('respects the earliest start', () => {
    const task = planTask({ earliestStartAt: '2026-10-07T17:02:00.000Z' });
    const { blocks } = plan({ tasks: [task] });
    expect(spans(blocks)).toEqual(['Wed 12:50–13:50']);
  });

  it('finds a long enough gap for one-sitting work', () => {
    const exam = planTask({ title: 'Practice exam', remainingMin: 180, splittable: false });
    const { blocks } = plan({ tasks: [exam] });
    expect(spans(blocks)).toEqual(['Mon 12:50–15:50']);
    expect(blocks[0]?.reason).toContain('One sitting, as set on the task.');
  });

  it('takes the last long gap for one-sitting work before other work can use it', () => {
    // Due Mon 5 PM: the only 3-hour gap before then is 12:50–5:00 PM.
    const exam = planTask({
      subject: 'x',
      remainingMin: 180,
      splittable: false,
      dueAt: '2026-10-05T22:00:00.000Z',
    });
    const filler = planTask({ subject: 'y', remainingMin: 600, dueAt: '2026-10-05T21:00:00.000Z' });
    const { blocks } = plan({ tasks: [exam, filler] });
    const examBlock = blocks.find((b) => b.taskId === exam.id);
    expect(examBlock && local(examBlock.startAt)).toBe('Mon 12:50');
    expect(examBlock?.reason).toContain('no later gap before it');
  });

  it('warns with options when work does not fit before its due date', () => {
    const hw = planTask({
      title: 'Lab report',
      remainingMin: 600,
      dueAt: '2026-10-05T19:00:00.000Z',
    });
    const { blocks, warnings } = plan({ tasks: [hw] });
    expect(blocks.every((b) => ms(b.endAt) <= ms('2026-10-05T19:00:00.000Z'))).toBe(true);
    const planned = blocks.reduce((sum, b) => sum + minutesOf(b), 0);
    expect(warnings).toEqual([
      {
        kind: 'short',
        taskId: hw.id,
        title: 'Lab report',
        dueAt: '2026-10-05T19:00:00.000Z',
        minutes: 600 - planned,
        message: "6h 10m of Lab report doesn't fit before it's due Mon, Oct 5, 2:00 PM.",
        options: ['make-soft', 'edit-task'],
      },
    ]);
  });

  it('offers to split one-sitting work that fits no gap', () => {
    const exam = planTask({
      remainingMin: 600,
      splittable: false,
      dueAt: '2026-10-07T22:00:00.000Z',
    });
    const { blocks, warnings } = plan({ tasks: [exam] });
    expect(blocks).toEqual([]);
    expect(warnings[0]?.options).toEqual(['make-soft', 'allow-split', 'edit-task']);
    expect(warnings[0]?.message).toContain('needs one sitting');
  });

  it('reports overdue work', () => {
    const old = planTask({ title: 'Quiz corrections', dueAt: '2026-10-04T22:00:00.000Z' });
    const { blocks, warnings } = plan({ tasks: [old] });
    expect(blocks).toEqual([]);
    expect(warnings).toEqual([
      expect.objectContaining({
        kind: 'overdue',
        minutes: 60,
        message: 'Quiz corrections was due Sun, Oct 4, 5:00 PM and has 1h of work left.',
        options: ['make-soft', 'edit-task'],
      }),
    ]);
  });

  it('plans work past a soft deadline right away', () => {
    const old = planTask({
      title: 'Read ch. 2',
      dueAt: '2026-10-04T22:00:00.000Z',
      deadline: 'soft',
    });
    const later = planTask({ dueAt: '2026-10-06T22:00:00.000Z' });
    const { blocks, warnings } = plan({ tasks: [later, old] });
    expect(blocks[0]?.taskId).toBe(old.id);
    expect(blocks[0]?.reason).toBe(
      'Soft deadline Sun, Oct 4, 5:00 PM: planned after it, as a soft deadline allows.',
    );
    expect(warnings).toEqual([
      {
        kind: 'late',
        taskId: old.id,
        title: 'Read ch. 2',
        dueAt: '2026-10-04T22:00:00.000Z',
        minutes: 960,
        message:
          'Read ch. 2 is planned to finish Mon, Oct 5, 9:00 AM, after its soft deadline, Sun, Oct 4, 5:00 PM.',
        options: ['edit-task'],
      },
    ]);
  });

  it('plans a soft deadline past its date when there is no room before it', () => {
    // Due Mon 2 PM with 10 h of work: what doesn't fit by then goes after it.
    const reading = planTask({
      remainingMin: 600,
      dueAt: '2026-10-05T19:00:00.000Z',
      deadline: 'soft',
    });
    const { blocks, warnings } = plan({ tasks: [reading] });
    expect(blocks.reduce((sum, b) => sum + minutesOf(b), 0)).toBe(600);
    expect(blocks.some((b) => ms(b.endAt) > ms('2026-10-05T19:00:00.000Z'))).toBe(true);
    expect(warnings.map((w) => w.kind)).toEqual(['late']);
  });

  it('lets soft deadlines give way to hard ones when time is short', () => {
    // Mon 8 AM–noon has 3 h of free time. A soft 2-hour task is due at 11 AM and a hard 2-hour
    // task at noon: both can't be on time, so the hard one is.
    const soft = planTask({
      subject: 'a',
      remainingMin: 120,
      dueAt: '2026-10-05T16:00:00.000Z',
      deadline: 'soft',
    });
    const hard = planTask({ subject: 'b', remainingMin: 120, dueAt: '2026-10-05T17:00:00.000Z' });
    const { blocks, warnings } = plan({ tasks: [soft, hard] });
    const hardEnd = Math.max(...blocks.filter((b) => b.taskId === hard.id).map((b) => ms(b.endAt)));
    expect(hardEnd).toBeLessThanOrEqual(ms(hard.dueAt));
    expect(warnings.map((w) => [w.kind, w.taskId])).toEqual([['late', soft.id]]);
    const softBlock = blocks.find((b) => b.taskId === soft.id);
    expect(softBlock?.reason).toContain('Hard deadlines come first this week.');
  });

  it('plans tasks without an estimate and says so', () => {
    const task = planTask({ remainingMin: 60, estimated: false });
    const { blocks } = plan({ tasks: [task] });
    expect(blocks[0]?.reason).toContain("No estimate yet, so it's planned for the default length.");
  });

  it('gives the running task the first block', () => {
    const urgent = planTask({ subject: 'a', dueAt: '2026-10-08T22:00:00.000Z' });
    const running = planTask({ subject: 'b' });
    const { blocks } = plan({ tasks: [urgent, running], runningTaskId: running.id });
    expect(blocks[0]?.taskId).toBe(running.id);
    expect(blocks[0]?.reason).toContain("You're working on it now.");
  });

  it("doesn't keep the running task first when that would miss a deadline", () => {
    // Due at 10 AM: 90 minutes of work in the 8–10 AM gap leaves no room for the running task.
    const urgent = planTask({ subject: 'a', remainingMin: 90, dueAt: '2026-10-05T15:00:00.000Z' });
    const running = planTask({ subject: 'b' });
    const { blocks, warnings } = plan({ tasks: [urgent, running], runningTaskId: running.id });
    expect(warnings).toEqual([]);
    expect(blocks[0]?.taskId).toBe(urgent.id);
  });

  it('plans around kept blocks, with a break after kept work', () => {
    const task = planTask({ remainingMin: 60 });
    const { blocks } = plan({
      tasks: [task],
      kept: [
        { startAt: NOW, endAt: '2026-10-05T13:30:00.000Z', mode: 'work' },
        { startAt: '2026-10-05T13:40:00.000Z', endAt: '2026-10-05T14:00:00.000Z', mode: 'busy' },
        {
          startAt: '2026-10-05T14:00:00.000Z',
          endAt: '2026-10-05T18:00:00.000Z',
          mode: 'background',
        },
      ],
    });
    expect(spans(blocks)).toEqual(['Mon 9:00–10:00']);
  });

  it('keeps sleep where it is across the fall-back change', () => {
    const now = '2026-10-31T13:00:00.000Z';
    const until = '2026-11-03T06:00:00.000Z';
    const fallFixed = fixedBetween(now, until);
    const tasks = Array.from({ length: 5 }, (_, i) =>
      planTask({ subject: `c${i}`, remainingMin: 600 }),
    );
    const { blocks } = planWeek({
      now: new Date(now),
      until: new Date(until),
      timeZone: ZONE,
      tasks,
      fixed: fallFixed,
      kept: [],
    });
    const sleep = fallFixed.filter((f) => f.kind === 'sleep');
    expect(sleep.map((s) => local(s.startAt))).toContain('Sun 23:00');
    for (const b of blocks) for (const s of sleep) expect(overlaps(b, s)).toBe(false);
    // Sunday ends at 10:30 PM local (UTC-6 after the change).
    const sunday = blocks.filter((b) => local(b.startAt).startsWith('Sun'));
    expect(sunday.at(-1)?.endAt).toBe('2026-11-02T04:30:00.000Z');
  });

  describe('steps (laundry)', () => {
    const laundry = (fields = {}) =>
      planTask({
        title: 'Laundry',
        background: true,
        steps: [
          { title: 'Load the washer', minutes: 5, wait: false },
          { title: 'washer', minutes: 45, wait: true },
          { title: 'Move to the dryer', minutes: 5, wait: false },
          { title: 'dryer', minutes: 60, wait: true },
          { title: 'Fold', minutes: 15, wait: false },
        ],
        ...fields,
      });

    it('plans hands-on steps and lets the waits run alongside focus work', () => {
      const task = laundry();
      const study = planTask({ subject: 'math', remainingMin: 600 });
      const { blocks, warnings } = plan({ tasks: [task, study] });
      expect(warnings).toEqual([]);
      const mine = blocks.filter((b) => b.taskId === task.id);
      expect(mine.map((b) => [b.kind, b.title, minutesOf(b)])).toEqual([
        ['step', 'Laundry: Load the washer', 5],
        ['wait', 'Laundry: washer', 45],
        ['step', 'Laundry: Move to the dryer', 5],
        ['wait', 'Laundry: dryer', 60],
        ['step', 'Laundry: Fold', 15],
      ]);
      // Each step follows its wait within 30 minutes, and no wait touches a class.
      for (let i = 1; i < mine.length; i++) {
        const gap = ms(mine[i]?.startAt ?? '') - ms(mine[i - 1]?.endAt ?? '');
        expect(gap).toBeGreaterThanOrEqual(0);
        expect(gap).toBeLessThanOrEqual(30 * 60_000);
      }
      const hard = fixed.filter((f) => f.kind !== 'meal' && f.kind !== 'hygiene');
      for (const b of mine) for (const f of hard) expect(overlaps(b, f)).toBe(false);
      // Study blocks never overlap a hands-on step, but they do overlap the waits.
      const work = blocks.filter((b) => b.taskId === study.id);
      const steps = mine.filter((b) => b.kind === 'step');
      for (const w of work) for (const s of steps) expect(overlaps(w, s)).toBe(false);
      expect(work.some((w) => mine.some((m) => m.kind === 'wait' && overlaps(w, m)))).toBe(true);
      expect(mine[2]?.reason).toBe(
        'Hands-on step 2 of 3, after the 45m wait. Due Thu, Dec 31, 5:59 PM. The first day it fits, where it splits free time least.',
      );
    });

    it('picks the time on the first day that splits free time least', () => {
      const { blocks } = plan({ tasks: [laundry()] });
      // Classes break up Monday morning; the evening run ends the second step at dinner and
      // starts folding right after it.
      expect(blocks.map((b) => local(b.startAt))).toEqual([
        'Mon 19:05',
        'Mon 19:10',
        'Mon 19:55',
        'Mon 20:00',
        'Mon 21:00',
      ]);
    });

    it('warns when the steps fit nowhere before the due date', () => {
      const task = laundry({ dueAt: '2026-10-05T14:30:00.000Z' });
      const { blocks, warnings } = plan({ tasks: [task] });
      expect(blocks).toEqual([]);
      expect(warnings).toEqual([
        expect.objectContaining({
          kind: 'unplaced',
          taskId: task.id,
          minutes: 130,
          options: ['make-soft', 'edit-task'],
        }),
      ]);
    });

    it('plans a background task without steps as one block that may overlap meals', () => {
      const download = planTask({ title: 'Download dataset', background: true, remainingMin: 120 });
      const { blocks } = plan({ tasks: [download], now: new Date('2026-10-05T23:30:00.000Z') });
      // Mon 6:30 PM: the two hours run into dinner, which is fine for background work.
      expect(blocks.map((b) => [b.kind, local(b.startAt), minutesOf(b)])).toEqual([
        ['work', 'Mon 18:30', 120],
      ]);
    });
  });
});

describe('a realistic week (M5 acceptance)', () => {
  // Five courses, 25 tasks: homework, readings, a lab report, essay drafts, exam prep, a
  // one-sitting practice exam, and laundry; due dates spread over the week.
  const courses = ['MATH 2413', 'CHEM 1311', 'ENGL 1304', 'HIST 1377', 'COSC 1336'];
  const due = (day: number, hour: number) =>
    new Date(
      Date.parse('2026-10-05T05:00:00.000Z') + day * 86_400_000 + hour * 3_600_000,
    ).toISOString();
  const tasks = [
    ...courses.flatMap((course, c) => [
      planTask({
        title: `${course} homework`,
        subject: course,
        remainingMin: 120,
        dueAt: due(1 + (c % 3), 23),
      }),
      planTask({
        title: `${course} reading`,
        subject: course,
        remainingMin: 60,
        dueAt: due(2 + (c % 4), 9),
      }),
      planTask({ title: `${course} review`, subject: course, remainingMin: 45, priority: 'low' }),
      planTask({
        title: `${course} problem set`,
        subject: course,
        remainingMin: 150,
        dueAt: due(4 + (c % 2), 17),
      }),
    ]),
    planTask({
      title: 'CHEM lab report',
      subject: 'CHEM 1311',
      remainingMin: 240,
      dueAt: due(3, 12),
    }),
    planTask({
      title: 'ENGL essay draft',
      subject: 'ENGL 1304',
      remainingMin: 300,
      dueAt: due(5, 23),
    }),
    planTask({
      title: 'MATH practice exam',
      subject: 'MATH 2413',
      remainingMin: 120,
      splittable: false,
      dueAt: due(6, 12),
    }),
    planTask({
      title: 'COSC project',
      subject: 'COSC 1336',
      remainingMin: 360,
      dueAt: due(6, 23),
      minChunkMin: 60,
    }),
    planTask({
      title: 'Laundry',
      subject: 'chores',
      background: true,
      dueAt: due(6, 20),
      steps: [
        { title: 'Load the washer', minutes: 5, wait: false },
        { title: 'washer', minutes: 45, wait: true },
        { title: 'Move to the dryer', minutes: 5, wait: false },
        { title: 'dryer', minutes: 60, wait: true },
        { title: 'Fold', minutes: 15, wait: false },
      ],
    }),
  ];

  it('plans 25 tasks in well under a second, meeting every deadline', () => {
    expect(tasks).toHaveLength(25);
    const started = Date.now();
    const { blocks, warnings } = plan({ tasks });
    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(1000);
    expect(warnings).toEqual([]);
    // Every task is fully planned, before its due date.
    for (const task of tasks) {
      const mine = blocks.filter((b) => b.taskId === task.id);
      if (task.steps.length > 0) {
        expect(mine).toHaveLength(5);
        continue;
      }
      expect(mine.reduce((sum, b) => sum + minutesOf(b), 0)).toBe(task.remainingMin);
      if (task.dueAt) for (const b of mine) expect(ms(b.endAt)).toBeLessThanOrEqual(ms(task.dueAt));
    }
    // Focus blocks never overlap each other or sleep.
    const focus = blocks.filter((b) => b.kind !== 'wait');
    for (const a of focus) for (const b of focus) if (a !== b) expect(overlaps(a, b)).toBe(false);
    const sleep = fixed.filter((f) => f.kind === 'sleep');
    for (const b of blocks) for (const s of sleep) expect(overlaps(b, s)).toBe(false);
  });

  it('re-plans the week after a 30-minute late start in well under a second (M6)', () => {
    const first = plan({ tasks });
    const [late, ...rest] = first.blocks.filter((b) => b.kind === 'work');
    const later = new Date(ms(late?.startAt ?? '') + 30 * 60_000);
    const previous = first.blocks
      .map((b, i) => ({
        id: `p${i}`,
        taskId: b.taskId,
        startAt: b.startAt,
        endAt: b.endAt,
        kind: b.kind,
      }))
      .filter((p) => p.startAt >= later.toISOString());
    const started = Date.now();
    const out = replan({
      now: later,
      until: new Date(UNTIL),
      timeZone: ZONE,
      tasks,
      fixed,
      kept: [],
      previous,
      startNowTaskId: late?.taskId,
    });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(out.fallback).toBe('none');
    expect(out.warnings).toEqual([]);
    // Only the late task's work moved.
    expect(rest.length).toBeGreaterThan(30);
    const moved = out.blocks.filter((b) => b.previousId === undefined);
    expect(new Set(moved.map((b) => b.taskId))).toEqual(new Set([late?.taskId]));
    expect(out.blocks.filter((b) => b.previousId)).toHaveLength(previous.length);
  });

  it('mixes subjects instead of doing one course at a time', () => {
    const { blocks } = plan({ tasks });
    const subjects = blocks
      .filter((b) => b.kind === 'work')
      .map((b) => tasks.find((t) => t.id === b.taskId)?.subject);
    let same = 0;
    for (let i = 1; i < subjects.length; i++) if (subjects[i] === subjects[i - 1]) same++;
    expect(same / (subjects.length - 1)).toBeLessThan(0.25);
  });
});
