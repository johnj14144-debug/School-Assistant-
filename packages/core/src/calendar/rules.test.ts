import { describe, expect, it } from 'vitest';
import {
  type AgendaEntry,
  agendaNow,
  type BlockSpan,
  type FixedSpan,
  findBlockConflict,
  fixedEventProblem,
} from './rules';

const t = (hhmm: string) => `2026-10-07T${hhmm}:00.000Z`;

describe('fixedEventProblem', () => {
  const base = {
    kind: 'class' as const,
    startDate: '2026-08-24',
    startLocal: '10:00',
    endLocal: '10:50',
    rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261209',
  };

  it('accepts a normal class', () => {
    expect(fixedEventProblem(base, 450)).toBeNull();
  });

  it('rejects a zero-length event and a repeat that ends before it starts', () => {
    expect(fixedEventProblem({ ...base, endLocal: '10:00' }, 450)).toMatch(/end time/);
    expect(fixedEventProblem({ ...base, startDate: '2026-12-10' }, 450)).toMatch(/ends before/);
  });

  it('keeps sleep at or above the floor', () => {
    const sleep = { ...base, kind: 'sleep' as const, rrule: 'FREQ=DAILY' };
    expect(fixedEventProblem({ ...sleep, startLocal: '23:00', endLocal: '06:30' }, 450)).toBeNull();
    expect(fixedEventProblem({ ...sleep, startLocal: '23:30', endLocal: '06:30' }, 450)).toBe(
      'Sleep must be at least 7 h 30 min (the sleep floor)',
    );
    expect(fixedEventProblem({ ...sleep, startLocal: '23:00', endLocal: '06:30' }, 480)).toBe(
      'Sleep must be at least 8 h (the sleep floor)',
    );
  });
});

describe('findBlockConflict', () => {
  const fixed: FixedSpan[] = [
    { kind: 'sleep', label: 'Sleep', startAt: t('04:00'), endAt: t('11:30') },
    { kind: 'class', label: 'MATH 2413', startAt: t('15:00'), endAt: t('15:50') },
    { kind: 'meal', label: 'Lunch', startAt: t('17:00'), endAt: t('17:30') },
  ];
  const blocks: BlockSpan[] = [
    { id: 'calc', label: 'Calc HW', background: false, startAt: t('13:00'), endAt: t('14:00') },
    { id: 'wash', label: 'Laundry', background: true, startAt: t('18:00'), endAt: t('19:00') },
  ];
  const focus = (from: string, to: string, id?: string) => ({
    id,
    background: false,
    startAt: t(from),
    endAt: t(to),
  });

  it('refuses focus blocks over fixed events and other focus blocks', () => {
    expect(findBlockConflict(focus('15:30', '16:30'), blocks, fixed)).toMatchObject({
      with: 'fixed',
      label: 'MATH 2413',
    });
    expect(findBlockConflict(focus('13:30', '14:30'), blocks, fixed)).toMatchObject({
      with: 'block',
      label: 'Calc HW',
    });
    // Touching is fine; overlapping a background block is fine.
    expect(findBlockConflict(focus('14:00', '15:00'), blocks, fixed)).toBeNull();
    expect(findBlockConflict(focus('18:00', '19:00'), blocks, fixed)).toBeNull();
  });

  it('ignores the block being moved', () => {
    expect(findBlockConflict(focus('13:30', '14:30', 'calc'), blocks, fixed)).toBeNull();
  });

  it('lets background blocks overlap meals and other blocks, not classes, commitments or sleep', () => {
    const laundry = (from: string, to: string) => ({
      background: true,
      startAt: t(from),
      endAt: t(to),
    });
    expect(findBlockConflict(laundry('16:45', '17:45'), blocks, fixed)).toBeNull();
    expect(findBlockConflict(laundry('13:00', '14:30'), blocks, fixed)).toBeNull();
    expect(findBlockConflict(laundry('13:00', '15:30'), blocks, fixed)).toMatchObject({
      label: 'MATH 2413',
    });
    const chapter: FixedSpan = {
      kind: 'other',
      label: 'Chapter meeting',
      startAt: t('23:00'),
      endAt: t('23:59'),
    };
    expect(findBlockConflict(laundry('22:30', '23:30'), blocks, [chapter])).toMatchObject({
      label: 'Chapter meeting',
    });
    expect(findBlockConflict(laundry('11:00', '12:00'), blocks, fixed)).toMatchObject({
      label: 'Sleep',
    });
  });
});

describe('agendaNow', () => {
  const entry = (
    id: string,
    kind: 'block' | 'fixed',
    from: string,
    to: string,
    background = false,
  ): AgendaEntry & { id: string } => ({ id, kind, background, startAt: t(from), endAt: t(to) });
  const day = [
    entry('class', 'fixed', '15:00', '15:50'),
    entry('hw', 'block', '16:00', '17:00'),
    entry('wash', 'block', '16:30', '18:00', true),
    entry('lunch', 'fixed', '17:00', '17:30'),
  ];
  const at = (hhmm: string) => {
    const { current, next } = agendaNow(day, new Date(t(hhmm)));
    return [current?.id ?? null, next?.id ?? null];
  };

  it('finds what is happening now and what is next', () => {
    expect(at('14:00')).toEqual([null, 'class']);
    expect(at('15:10')).toEqual(['class', 'hw']);
    expect(at('15:55')).toEqual([null, 'hw']);
    // A focus block beats a background block running alongside.
    expect(at('16:45')).toEqual(['hw', 'lunch']);
    // Starts are inclusive, ends exclusive.
    expect(at('17:00')).toEqual(['lunch', null]);
    // Only the background block is left.
    expect(at('17:40')).toEqual(['wash', null]);
    expect(at('18:00')).toEqual([null, null]);
  });
});
