import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { tempDir } from '../../test/helpers';
import { setupTasks } from '../../test/tasks';

const at = (hhmm: string) => `2026-10-07T${hhmm}:00.000Z`;

describe('TimerService', () => {
  it('starts, pauses, resumes and stops, one session per run', () => {
    const { timer, tasks, task, clock, onChange } = setupTasks(at('15:00'));
    const hw = task('Calc HW', { estimateMin: 60 });
    onChange.mockClear();

    const running = timer.start(hw.id);
    expect(running.focus).toMatchObject({
      task: { id: hw.id, running: true },
      session: { startAt: at('15:00'), endAt: null, source: 'desktop' },
      priorMin: 0,
    });
    clock.set(at('15:25'));
    const paused = timer.pause();
    expect(paused.focus).toBeNull();
    expect(paused.paused).toMatchObject({ task: { id: hw.id }, session: null, priorMin: 25 });

    clock.set(at('15:40'));
    const resumed = timer.resume();
    expect(resumed.paused).toBeNull();
    expect(resumed.focus).toMatchObject({ session: { startAt: at('15:40') }, priorMin: 25 });
    clock.set(at('16:00'));
    expect(timer.stop()).toEqual({ focus: null, paused: null, background: [] });

    const detail = tasks.get(hw.id);
    expect(detail.sessions.map((s) => [s.startAt, s.endAt])).toEqual([
      [at('15:40'), at('16:00')],
      [at('15:00'), at('15:25')],
    ]);
    expect(detail.task.actualMin).toBe(45);
    expect(onChange).toHaveBeenCalledTimes(4);
  });

  it('runs one focus task at a time: starting another stops the first then', () => {
    const { timer, tasks, task, clock } = setupTasks(at('15:00'));
    const read = task('Read');
    const hw = task('HW', { attention: 'light' });
    timer.start(read.id);
    clock.set(at('15:30'));
    const state = timer.start(hw.id);
    expect(state.focus?.task.id).toBe(hw.id);
    expect(tasks.get(read.id).sessions[0]?.endAt).toBe(at('15:30'));
  });

  it('runs background tasks alongside, and stops them one by one', () => {
    const { timer, task, clock } = setupTasks(at('15:00'));
    const wash = task('Laundry', { attention: 'background' });
    const download = task('Download dataset', { attention: 'background' });
    const read = task('Read');
    timer.start(wash.id);
    timer.start(read.id);
    timer.start(download.id);
    clock.set(at('15:10'));
    let state = timer.state();
    expect(state.focus?.task.id).toBe(read.id);
    expect(state.background.map((b) => b.task.id)).toEqual([wash.id, download.id]);
    state = timer.stop(wash.id);
    expect(state.background.map((b) => b.task.id)).toEqual([download.id]);
    expect(state.focus?.task.id).toBe(read.id);
    expect(() => timer.stop(wash.id)).toThrow(/not running/);
  });

  it('keeps a paused task across a background start, and Stop clears it', () => {
    const { timer, task, settings } = setupTasks(at('15:00'));
    const read = task('Read');
    const wash = task('Laundry', { attention: 'background' });
    timer.start(read.id);
    timer.pause();
    expect(timer.start(wash.id).paused?.task.id).toBe(read.id);
    expect(timer.stop().paused).toBeNull();
    expect(settings.get('timer.paused')).toBeNull();
    expect(() => timer.stop()).toThrow(/not running/);
    expect(() => timer.pause()).toThrow(/No task is being timed/);
    expect(() => timer.resume()).toThrow(/Nothing is paused/);
  });

  describe('"I started at…"', () => {
    it('starts in the past and stops the running task at that moment', () => {
      const { timer, tasks, task, clock } = setupTasks(at('14:00'));
      const email = task('Email');
      const essay = task('Essay');
      timer.start(email.id);
      clock.set(at('15:00'));
      const state = timer.start(essay.id, at('14:20'));
      expect(state.focus).toMatchObject({
        task: { id: essay.id },
        session: { startAt: at('14:20') },
      });
      expect(tasks.get(email.id).sessions[0]?.endAt).toBe(at('14:20'));
    });

    it('moves the start of a task that is already running', () => {
      const { timer, task, clock } = setupTasks(at('15:00'));
      const essay = task('Essay');
      timer.start(essay.id);
      clock.set(at('15:30'));
      expect(timer.start(essay.id).focus?.session?.startAt).toBe(at('15:00'));
      expect(timer.start(essay.id, at('14:45')).focus?.session?.startAt).toBe(at('14:45'));
    });

    it('refuses a start before the running task began, or inside finished work', () => {
      const { timer, task, clock } = setupTasks(at('14:00'));
      const email = task('Email');
      const essay = task('Essay');
      const read = task('Read');
      timer.start(email.id);
      clock.set(at('14:30'));
      timer.start(read.id);
      clock.set(at('15:00'));
      expect(() => timer.start(essay.id, at('14:30'))).toThrow(/before Read/);
      expect(() => timer.start(essay.id, at('14:10'))).toThrow(/before Read/);
      timer.stop();
      expect(() => timer.start(essay.id, at('14:10'))).toThrow(/overlaps Email/);
      expect(timer.start(essay.id, at('15:00')).focus?.task.id).toBe(essay.id);
    });

    it('rejects a start in the future but forgives a few seconds of clock difference', () => {
      const { timer, task } = setupTasks(at('15:00'));
      const essay = task('Essay');
      expect(() => timer.start(essay.id, at('15:05'))).toThrow(/future/);
      const state = timer.start(essay.id, '2026-10-07T15:00:20.000Z');
      expect(state.focus?.session?.startAt).toBe(at('15:00'));
    });

    it('refuses to time a finished task', () => {
      const { timer, task, complete } = setupTasks(at('15:00'));
      const essay = task('Essay');
      complete(essay.id);
      expect(() => timer.start(essay.id)).toThrow(/is done/);
    });
  });

  describe('editing sessions', () => {
    it('adds time worked without the timer, refusing overlaps', () => {
      const { timer, tasks, task } = setupTasks(at('18:00'));
      const essay = task('Essay');
      const read = task('Read');
      const session = timer.createSession({
        taskId: essay.id,
        startAt: '2026-10-07T13:00:00Z',
        endAt: at('14:30'),
      });
      expect(session).toMatchObject({ startAt: at('13:00'), endAt: at('14:30'), source: 'manual' });
      expect(tasks.get(essay.id).task.actualMin).toBe(90);
      expect(() =>
        timer.createSession({ taskId: read.id, startAt: at('14:00'), endAt: at('15:00') }),
      ).toThrow(/overlaps Essay/);
      expect(() =>
        timer.createSession({ taskId: read.id, startAt: at('15:00'), endAt: at('15:00') }),
      ).toThrow(/end after it starts/);
      expect(() =>
        timer.createSession({ taskId: read.id, startAt: at('17:00'), endAt: at('19:00') }),
      ).toThrow(/future/);
    });

    it('moves a session, and setting the end of a running one stops it then', () => {
      const { timer, tasks, task, clock } = setupTasks(at('15:00'));
      const essay = task('Essay');
      const read = task('Read');
      timer.start(essay.id);
      clock.set(at('17:00'));
      // Forgot to stop at 3:45.
      const sessionId = timer.state().focus?.session?.id ?? '';
      expect(timer.updateSession({ id: sessionId, endAt: at('15:45') }).focus).toBeNull();
      expect(tasks.get(essay.id).task.actualMin).toBe(45);
      timer.createSession({ taskId: read.id, startAt: at('16:00'), endAt: at('16:30') });
      expect(() => timer.updateSession({ id: sessionId, endAt: at('16:10') })).toThrow(
        /overlaps Read/,
      );
      expect(() => timer.updateSession({ id: sessionId, startAt: at('15:50') })).toThrow(
        /end after it starts/,
      );
      timer.deleteSession(sessionId);
      expect(tasks.get(essay.id).sessions).toEqual([]);
    });
  });

  it('keeps a running timer and the paused task across a restart', () => {
    const file = join(tempDir(), 'school-assistant.db');
    const first = setupTasks(at('15:00'), file);
    const essay = first.task('Essay');
    const read = first.task('Read');
    first.timer.start(read.id);
    first.timer.pause();
    first.timer.start(essay.id);
    first.database.close();

    const second = setupTasks(at('15:20'), file);
    const state = second.timer.state();
    expect(state.focus).toMatchObject({
      task: { id: essay.id },
      session: { startAt: at('15:00') },
    });
    // Starting the essay replaced the paused task.
    expect(state.paused).toBeNull();
    second.timer.pause();
    second.database.close();

    const third = setupTasks(at('15:30'), file);
    expect(third.timer.state().paused?.task.id).toBe(essay.id);
    expect(third.tasks.get(essay.id).task.actualMin).toBe(20);
    third.database.close();
  });
});
