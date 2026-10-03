import { formatMinutes, sessionMinutes, type TimerState } from '@sa/core';
import { Menu, type MenuItemConstructorOptions, nativeImage, Tray } from 'electron';
import type { Logger } from './log';

/** What the tray needs from the timer; null when the database isn't available. */
export interface TrayTimer {
  state(): TimerState;
  pause(): unknown;
  resume(): unknown;
  stop(taskId?: string): unknown;
}

/** Electron menus read `&` as a mnemonic marker on Windows. */
const label = (text: string) => text.replaceAll('&', '&&');

/** Menu items for the timer: what runs, and Pause / Resume / Stop. */
export function timerMenuItems(
  state: TimerState,
  now: Date,
  act: (action: () => unknown) => void,
  timer: TrayTimer,
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [];
  const minutes = (entry: TimerState['background'][number]) =>
    formatMinutes(entry.session ? sessionMinutes(entry.session, now) : 0);
  if (state.focus) {
    items.push(
      { label: label(`▶ ${state.focus.task.title} · ${minutes(state.focus)}`), enabled: false },
      { label: 'Pause', click: () => act(() => timer.pause()) },
      { label: 'Stop', click: () => act(() => timer.stop()) },
    );
  } else if (state.paused) {
    items.push(
      { label: label(`⏸ Paused: ${state.paused.task.title}`), enabled: false },
      { label: 'Resume', click: () => act(() => timer.resume()) },
      { label: 'Stop', click: () => act(() => timer.stop()) },
    );
  } else {
    items.push({ label: 'No timer running', enabled: false });
  }
  for (const entry of state.background) {
    const title = entry.task.title;
    items.push(
      { type: 'separator' },
      { label: label(`◷ ${title} · ${minutes(entry)}`), enabled: false },
      { label: label(`Stop ${title}`), click: () => act(() => timer.stop(entry.task.id)) },
    );
  }
  return items;
}

/** The tooltip line, e.g. "School Assistant · Calc HW 42m". */
export function trayTooltip(state: TimerState, now: Date): string {
  if (state.focus?.session) {
    const minutes = formatMinutes(sessionMinutes(state.focus.session, now));
    return `School Assistant · ${state.focus.task.title} ${minutes}`;
  }
  if (state.paused) return `School Assistant · Paused: ${state.paused.task.title}`;
  return 'School Assistant';
}

/**
 * Tray icon: the app keeps running here when the window is closed, and the menu shows the
 * timer. `refresh()` rebuilds the menu (only when its text changed).
 */
export function createTray(
  iconPath: string,
  showWindow: () => void,
  timer: TrayTimer | null,
  log: Logger,
): { tray: Tray; refresh: () => void } {
  const tray = new Tray(nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 }));
  let shown = '';

  const act = (action: () => unknown) => {
    try {
      action();
    } catch (error) {
      log.warn('Tray timer action failed', error);
    }
  };

  const refresh = () => {
    let items: MenuItemConstructorOptions[] = [];
    let tooltip = 'School Assistant';
    if (timer) {
      try {
        const now = new Date();
        const state = timer.state();
        items = [...timerMenuItems(state, now, act, timer), { type: 'separator' }];
        tooltip = trayTooltip(state, now);
      } catch (error) {
        log.warn('Could not read the timer for the tray', error);
      }
    }
    const template: MenuItemConstructorOptions[] = [
      ...items,
      { label: 'Open School Assistant', click: showWindow },
      { type: 'separator' },
      { label: 'Quit', role: 'quit' },
    ];
    const key = JSON.stringify([tooltip, template.map((i) => [i.label, i.enabled])]);
    if (key === shown) return;
    shown = key;
    tray.setToolTip(tooltip);
    tray.setContextMenu(Menu.buildFromTemplate(template));
  };

  tray.on('click', showWindow);
  refresh();
  return { tray, refresh };
}
