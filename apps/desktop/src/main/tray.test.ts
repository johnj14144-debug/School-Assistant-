import type { TimerEntry, TimerState } from '@sa/core';
import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ Menu: {}, nativeImage: {}, Tray: class {} }));
const { timerMenuItems, trayTooltip } = await import('./tray');

const now = new Date('2026-10-07T15:42:00.000Z');
function entry(title: string, id: string, startAt: string | null): TimerEntry {
  return {
    task: { id, title } as TimerEntry['task'],
    session: startAt
      ? { id: `s-${id}`, taskId: id, startAt, endAt: null, source: 'desktop' }
      : null,
    priorMin: 0,
  };
}
const idle: TimerState = { focus: null, paused: null, background: [] };

function setup() {
  const timer = { state: () => idle, pause: vi.fn(), resume: vi.fn(), stop: vi.fn() };
  const act = (action: () => unknown) => action();
  return { timer, act };
}

describe('tray timer menu', () => {
  it('shows the running task with Pause and Stop, and background tasks', () => {
    const { timer, act } = setup();
    const state: TimerState = {
      focus: entry('Calc HW & reading', 'calc', '2026-10-07T15:00:00.000Z'),
      paused: null,
      background: [entry('Laundry', 'wash', '2026-10-07T15:30:00.000Z')],
    };
    const items = timerMenuItems(state, now, act, timer);
    expect(items.map((i) => i.label ?? i.type)).toEqual([
      '▶ Calc HW && reading · 42m',
      'Pause',
      'Stop',
      'separator',
      '◷ Laundry · 12m',
      'Stop Laundry',
    ]);
    items[1]?.click?.({} as never, undefined, {} as never);
    items[5]?.click?.({} as never, undefined, {} as never);
    expect(timer.pause).toHaveBeenCalled();
    expect(timer.stop).toHaveBeenCalledWith('wash');
    expect(trayTooltip(state, now)).toBe('School Assistant · Calc HW & reading 42m');
  });

  it('offers Resume for a paused task, and says when nothing runs', () => {
    const { timer, act } = setup();
    const state: TimerState = { ...idle, paused: entry('Essay', 'essay', null) };
    const items = timerMenuItems(state, now, act, timer);
    expect(items.map((i) => i.label)).toEqual(['⏸ Paused: Essay', 'Resume', 'Stop']);
    items[1]?.click?.({} as never, undefined, {} as never);
    expect(timer.resume).toHaveBeenCalled();
    expect(trayTooltip(state, now)).toBe('School Assistant · Paused: Essay');
    expect(timerMenuItems(idle, now, act, timer).map((i) => i.label)).toEqual(['No timer running']);
    expect(trayTooltip(idle, now)).toBe('School Assistant');
  });
});
