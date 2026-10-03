import { describe, expect, it } from 'vitest';
import { setupTasks } from '../../test/tasks';

describe('TasksService', () => {
  it('creates a task with defaults and reports the change', () => {
    const { task, onChange } = setupTasks();
    expect(task('Calc HW 3')).toMatchObject({
      title: 'Calc HW 3',
      parentId: null,
      courseId: null,
      type: '',
      priority: 'normal',
      attention: 'focus',
      todayOrder: null,
      status: 'open',
      completedAt: null,
      createdAt: '2026-10-07T15:00:00.000Z',
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('gives a subtask its parent course and type unless told otherwise', () => {
    const { task, course } = setupTasks();
    const calc = course('Calculus I', 'MATH 2413');
    const parent = task('Problem set 4', { courseId: calc.id, type: 'homework' });
    expect(task('Problems 1–6', { parentId: parent.id })).toMatchObject({
      courseId: calc.id,
      type: 'homework',
    });
    expect(
      task('Office hours', { parentId: parent.id, courseId: null, type: 'meeting' }),
    ).toMatchObject({ courseId: null, type: 'meeting' });
  });

  it('takes the course from a linked assignment and rejects a mismatch', () => {
    const { task, update, course, assignment } = setupTasks();
    const calc = course('Calc');
    const hist = course('History');
    const hw = assignment(calc.id, 'HW 4');
    const essay = assignment(hist.id, 'Essay');
    const t = task('Do HW 4', { assignmentId: hw.id });
    expect(t).toMatchObject({ courseId: calc.id, assignmentId: hw.id });
    expect(() => task('x', { courseId: hist.id, assignmentId: hw.id })).toThrow(/different course/);
    // Linking another assignment moves the task to that course…
    expect(update(t.id, { assignmentId: essay.id })).toMatchObject({ courseId: hist.id });
    // …and choosing another course drops the link.
    expect(update(t.id, { courseId: calc.id })).toMatchObject({
      courseId: calc.id,
      assignmentId: null,
    });
    expect(update(t.id, { assignmentId: null })).toMatchObject({ courseId: calc.id });
  });

  it('refuses to make a task a subtask of itself or of its own subtasks', () => {
    const { task, update } = setupTasks();
    const a = task('A');
    const b = task('B', { parentId: a.id });
    const c = task('C', { parentId: b.id });
    expect(() => update(a.id, { parentId: c.id })).toThrow(/subtask of itself/);
    expect(() => update(a.id, { parentId: a.id })).toThrow(/subtask of itself/);
    expect(update(c.id, { parentId: a.id }).parentId).toBe(a.id);
  });

  it('lists open tasks by due date, priority and age; done ones newest first', () => {
    const { tasks, task, complete, clock } = setupTasks();
    task('no due');
    task('later', { dueAt: '2026-10-12T04:59:00.000Z' });
    task('soon, low', { dueAt: '2026-10-09T04:59:00.000Z', priority: 'low' });
    task('soon, high', { dueAt: '2026-10-09T04:59:00.000Z', priority: 'high' });
    const d1 = task('done 1');
    const d2 = task('done 2');
    complete(d1.id);
    clock.set('2026-10-07T16:00:00.000Z');
    complete(d2.id);
    expect(tasks.list('open').map((t) => t.title)).toEqual([
      'soon, high',
      'soon, low',
      'later',
      'no due',
    ]);
    expect(tasks.list('done').map((t) => t.title)).toEqual(['done 2', 'done 1']);
  });

  it('shows a task with its breadcrumb, subtasks, sessions and rolled-up time', () => {
    const { tasks, timer, task, clock, complete } = setupTasks();
    const essay = task('Essay', { estimateMin: 240 });
    const outline = task('Outline', { parentId: essay.id });
    const draft = task('Draft', { parentId: essay.id });
    const intro = task('Intro', { parentId: draft.id });
    timer.start(outline.id);
    clock.set('2026-10-07T15:30:00.000Z');
    timer.start(intro.id);
    clock.set('2026-10-07T15:50:00.000Z');
    complete(outline.id);

    const detail = tasks.get(essay.id);
    expect(detail.task).toMatchObject({ actualMin: 50, subtaskCount: 2, subtasksDone: 1 });
    expect(detail.subtasks.map((t) => t.title)).toEqual(['Draft', 'Outline']);
    // `running` is the task's own timer; Draft's time comes from its subtask.
    expect(detail.subtasks[0]).toMatchObject({ actualMin: 20, running: false });
    expect(detail.ownMin).toBe(0);
    expect(tasks.get(intro.id).ancestors.map((a) => a.title)).toEqual(['Essay', 'Draft']);
    expect(tasks.get(intro.id).sessions).toHaveLength(1);
  });

  it('completes a task: stops its and its subtasks’ timers, keeps the note; reopens', () => {
    const { tasks, timer, task, complete, clock } = setupTasks();
    const parent = task('Lab');
    const child = task('Measure', { parentId: parent.id, attention: 'background' });
    timer.start(parent.id);
    timer.start(child.id);
    clock.set('2026-10-07T15:45:00.000Z');
    const done = complete(parent.id, 'Measured and wrote up');
    expect(done).toMatchObject({
      status: 'done',
      completedAt: '2026-10-07T15:45:00.000Z',
      completionNote: 'Measured and wrote up',
    });
    expect(timer.state()).toEqual({ focus: null, paused: null, background: [] });
    expect(tasks.get(child.id).task.actualMin).toBe(45);

    clock.set('2026-10-07T16:00:00.000Z');
    expect(complete(parent.id, 'Fixed the note')).toMatchObject({
      completedAt: '2026-10-07T15:45:00.000Z',
      completionNote: 'Fixed the note',
    });
    expect(tasks.reopen(parent.id)).toMatchObject({ status: 'open', completedAt: null });
  });

  it('deletes a task with its subtasks and sessions, and forgets it as the paused task', () => {
    const { database, tasks, timer, task, settings } = setupTasks();
    const parent = task('Parent');
    const child = task('Child', { parentId: parent.id });
    timer.start(child.id);
    timer.pause();
    expect(settings.get('timer.paused')).toEqual({ taskId: child.id });
    tasks.delete(parent.id);
    expect(tasks.list('open')).toEqual([]);
    expect(settings.get('timer.paused')).toBeNull();
    expect(database.sqlite.prepare('select count(*) as n from time_session').get()).toEqual({
      n: 0,
    });
  });

  it('keeps the Today list in the order the user sets', () => {
    const { tasks, task } = setupTasks();
    const a = task('A', { today: true });
    const b = task('B', { today: true });
    const c = task('C');
    tasks.setToday(c.id, true);
    expect(tasks.today().tasks.map((t) => t.title)).toEqual(['A', 'B', 'C']);
    tasks.reorderToday([c.id, a.id]);
    expect(tasks.today().tasks.map((t) => t.title)).toEqual(['C', 'A', 'B']);
    tasks.setToday(a.id, false);
    expect(tasks.today().tasks.map((t) => t.title)).toEqual(['C', 'B']);
    tasks.setToday(a.id, true);
    expect(tasks.today().tasks.map((t) => t.title)).toEqual(['C', 'B', 'A']);
    expect(() => tasks.reorderToday([b.id, '0b9d6c53-3c4e-4d84-9a4e-0f1d1c2b3a4f'])).toThrow(
      /not found/,
    );
  });

  it("shows today's finished tasks and focus time since local midnight", () => {
    // 2026-10-07 is a Wednesday; Houston midnight is 05:00 UTC (CDT).
    const { tasks, timer, task, complete, clock } = setupTasks('2026-10-07T04:00:00.000Z');
    const late = task('Late night', { today: true });
    const wash = task('Laundry', { attention: 'background' });
    timer.start(late.id); // 11 pm Tuesday
    timer.start(wash.id);
    clock.set('2026-10-07T05:30:00.000Z');
    complete(late.id); // 12:30 am Wednesday
    timer.stop(wash.id);
    const yesterday = task('Yesterday');
    clock.set('2026-10-07T04:30:00.000Z');
    // (completed "before" midnight: not today)
    complete(yesterday.id);
    clock.set('2026-10-07T15:00:00.000Z');
    const read = task('Read', { today: true });
    timer.start(read.id);
    clock.set('2026-10-07T15:20:00.000Z');

    const today = tasks.today();
    expect(today.dayStart).toBe('2026-10-07T05:00:00.000Z');
    expect(today.tasks.map((t) => t.title)).toEqual(['Read']);
    expect(today.tasks[0]).toMatchObject({ running: true, actualMin: 20 });
    expect(today.done.map((t) => t.title)).toEqual(['Late night']);
    // 30 minutes after midnight on "Late night"; laundry and the running timer aren't included.
    expect(today.focusMinClosed).toBe(30);
  });

  it('builds history per task and per course + type', () => {
    const { tasks, timer, task, complete, clock, course } = setupTasks();
    const calc = course('Calculus I', 'MATH 2413');
    const hw = task('HW 3', { courseId: calc.id, type: 'homework', estimateMin: 60 });
    const parent = task('Project');
    const sub = task('Part 1', { parentId: parent.id, type: 'Homework', courseId: calc.id });
    timer.start(hw.id);
    clock.set('2026-10-07T16:30:00.000Z');
    complete(hw.id, 'All 12 problems');
    timer.start(sub.id);
    clock.set('2026-10-07T17:00:00.000Z');
    complete(sub.id);
    task('Not done', { courseId: calc.id, type: 'homework' });

    const history = tasks.history();
    expect(history.tasks).toEqual([
      expect.objectContaining({ title: 'Part 1', parentTitle: 'Project', actualMin: 30 }),
      expect.objectContaining({
        title: 'HW 3',
        estimateMin: 60,
        actualMin: 90,
        completionNote: 'All 12 problems',
        course: expect.objectContaining({ code: 'MATH 2413' }),
      }),
    ]);
    expect(history.groups).toEqual([
      {
        course: expect.objectContaining({ id: calc.id }),
        type: 'homework',
        doneCount: 2,
        spentMin: 120,
        compared: { count: 1, estimateMin: 60, actualMin: 90 },
      },
    ]);
    expect(tasks.types()).toEqual(['Homework']);
  });

  it('refuses to make a running background task a focus task while another one runs', () => {
    const { timer, task, update } = setupTasks();
    const wash = task('Laundry', { attention: 'background' });
    const read = task('Read');
    timer.start(wash.id);
    timer.start(read.id);
    expect(() => update(wash.id, { attention: 'focus' })).toThrow(/Read is being timed/);
    timer.stop(read.id);
    expect(update(wash.id, { attention: 'light' }).attention).toBe('light');
  });
});
