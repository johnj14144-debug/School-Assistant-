import { describe, expect, it } from 'vitest';
import {
  findConflict,
  minutesWithin,
  planMoveStart,
  planStart,
  type SessionRules,
  type SessionSpan,
  sessionMinutes,
} from './sessions';

const t = (hhmm: string) => `2026-10-07T${hhmm}:00.000Z`;
const span = (id: string, taskId: string, from: string, to: string | null): SessionSpan => ({
  id,
  taskId,
  startAt: t(from),
  endAt: to === null ? null : t(to),
});
const background = new Set(['laundry', 'download']);
const rules = (sessions: SessionSpan[]): SessionRules => ({
  sessions,
  isBackground: (id) => background.has(id),
});

describe('sessionMinutes / minutesWithin', () => {
  const now = new Date(t('15:00'));

  it('counts a closed session, and an open one up to now', () => {
    expect(sessionMinutes(span('a', 'calc', '14:00', '14:45'), now)).toBe(45);
    expect(sessionMinutes(span('a', 'calc', '14:30', null), now)).toBe(30);
    // A start in the future (clock skew) is never negative.
    expect(sessionMinutes(span('a', 'calc', '15:10', null), now)).toBe(0);
  });

  it('clips to a window', () => {
    const s = span('a', 'calc', '13:30', '14:30');
    expect(minutesWithin(s, new Date(t('14:00')), now)).toBe(30);
    expect(minutesWithin(s, new Date(t('14:45')), now)).toBe(0);
    expect(minutesWithin(span('b', 'calc', '14:50', null), new Date(t('14:00')), now)).toBe(10);
  });
});

describe('findConflict', () => {
  const existing = [
    span('calc1', 'calc', '13:00', '14:00'),
    span('wash', 'laundry', '13:30', '14:10'),
    span('read1', 'read', '14:00', null),
  ];

  it('rejects overlapping focus sessions, even across tasks', () => {
    expect(
      findConflict({ taskId: 'essay', startAt: t('13:45'), endAt: t('13:50') }, rules(existing)),
    ).toMatchObject({ id: 'calc1' });
    // The open session runs on, so anything after its start overlaps it.
    expect(
      findConflict({ taskId: 'essay', startAt: t('16:00'), endAt: t('16:30') }, rules(existing)),
    ).toMatchObject({ id: 'read1' });
  });

  it('lets sessions touch at the boundary', () => {
    expect(
      findConflict({ taskId: 'essay', startAt: t('12:00'), endAt: t('13:00') }, rules(existing)),
    ).toBeNull();
  });

  it('lets background tasks overlap other tasks but not themselves', () => {
    expect(
      findConflict({ taskId: 'download', startAt: t('13:00'), endAt: t('15:00') }, rules(existing)),
    ).toBeNull();
    expect(
      findConflict({ taskId: 'laundry', startAt: t('14:00'), endAt: t('14:20') }, rules(existing)),
    ).toMatchObject({ id: 'wash' });
  });

  it('ignores the session being edited', () => {
    expect(
      findConflict(
        { id: 'calc1', taskId: 'calc', startAt: t('12:30'), endAt: t('13:59') },
        rules(existing),
      ),
    ).toBeNull();
  });
});

describe('planStart', () => {
  it('closes the running focus session at the new start', () => {
    const running = span('read1', 'read', '14:00', null);
    expect(planStart('calc', t('14:30'), rules([running]))).toEqual({
      kind: 'ok',
      close: [running],
    });
  });

  it('keeps background timers running, and a background start closes nothing', () => {
    const wash = span('wash', 'laundry', '14:00', null);
    const read = span('read1', 'read', '14:05', null);
    expect(planStart('calc', t('14:30'), rules([wash, read]))).toEqual({
      kind: 'ok',
      close: [read],
    });
    expect(planStart('download', t('14:30'), rules([wash, read]))).toEqual({
      kind: 'ok',
      close: [],
    });
  });

  it('reports a timer that is already running', () => {
    const running = span('read1', 'read', '14:00', null);
    expect(planStart('read', t('14:30'), rules([running]))).toEqual({
      kind: 'running',
      session: running,
    });
  });

  it('refuses a backfilled start at or before the running session began', () => {
    const running = span('read1', 'read', '14:00', null);
    expect(planStart('calc', t('14:00'), rules([running]))).toEqual({
      kind: 'before-running',
      session: running,
    });
  });

  it('refuses a backfilled start inside a finished session', () => {
    const done = span('calc1', 'calc', '13:00', '14:00');
    expect(planStart('essay', t('13:50'), rules([done]))).toEqual({
      kind: 'overlap',
      session: done,
    });
    expect(planStart('essay', t('14:00'), rules([done]))).toEqual({ kind: 'ok', close: [] });
  });
});

describe('planMoveStart', () => {
  it('moves a switch earlier: the task it took over from ends at the new start', () => {
    const read = span('read1', 'read', '14:00', '14:40');
    const calc = span('calc1', 'calc', '14:40', null);
    expect(planMoveStart(calc, t('14:30'), rules([read, calc]))).toEqual({
      kind: 'ok',
      trim: { ...read, endAt: t('14:30') },
    });
    expect(planMoveStart(calc, t('14:00'), rules([read, calc]))).toEqual({
      kind: 'before-previous',
      session: read,
    });
  });

  it('leaves other sessions alone and reports real overlaps', () => {
    const email = span('email', 'email', '13:00', '13:30');
    const read = span('read1', 'read', '14:00', '14:20');
    const calc = span('calc1', 'calc', '14:40', null);
    const all = rules([email, read, calc]);
    expect(planMoveStart(calc, t('14:30'), all)).toEqual({ kind: 'ok', trim: null });
    expect(planMoveStart(calc, t('14:10'), all)).toEqual({ kind: 'overlap', session: read });
    // A background task never took over from a focus task.
    const longRead = span('read2', 'read', '14:00', '14:40');
    const wash = span('wash1', 'laundry', '14:40', null);
    expect(planMoveStart(wash, t('14:10'), rules([longRead, wash]))).toEqual({
      kind: 'ok',
      trim: null,
    });
  });
});
