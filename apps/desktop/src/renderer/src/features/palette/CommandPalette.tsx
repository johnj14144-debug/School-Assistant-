import type { TaskListItem } from '@sa/core';
import { Plus } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { cn } from '../../lib/cn';
import { todayLocal } from '../../lib/dates';
import { useIpcQuery, useLiveQuery } from '../../lib/useIpc';
import { routes } from '../../routes';
import { QuickAddPreview } from '../tasks/QuickAddPreview';
import { createInput, parseLine } from '../tasks/quickAdd';
import { useTaskActions } from '../timer/TaskActions';
import { matchesQuery } from './match';

interface Item {
  key: string;
  label: ReactNode;
  hint?: string;
  /** `shift`/`ctrl`: the modifier held with Enter or the click. */
  run: (mods: { shift: boolean; ctrl: boolean }) => unknown;
}

const searchText = (t: TaskListItem) =>
  [t.title, t.type, t.course?.code ?? '', t.course?.name ?? ''].join(' ');

/**
 * Ctrl+K: type a task to add it (with the quick-add shortcuts), or find one to start or open,
 * control the timer, or jump to a page.
 */
export function CommandPalette() {
  const ref = useRef<HTMLDialogElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const actions = useTaskActions();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [selected, setSelected] = useState(0);
  const [today, setToday] = useState(false);
  const { data: courses } = useIpcQuery('course:list', undefined, open ? 'open' : 'closed');
  const { data: tasks } = useLiveQuery('task:list', { status: 'open' });

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setText('');
        setSelected(0);
        setToday(location.pathname.startsWith('/today'));
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [location.pathname]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => setOpen(false);
  /** Closes the palette, then runs the command. */
  const after = (command: () => unknown) => () => {
    close();
    return command();
  };
  const parsed = parseLine(text, courses ?? []);
  const query = text.trim();
  const { timer } = actions;
  const now = todayLocal();
  // A task due today goes on the Today list too.
  const dueToday =
    parsed.due !== null &&
    parsed.due.year === now.year &&
    parsed.due.month === now.month &&
    parsed.due.day === now.day;

  const items: Item[] = [];
  if (parsed.title) {
    items.push({
      key: 'add',
      label: (
        <span className="flex items-center gap-2">
          <Plus className="size-4 text-indigo-600" aria-hidden />
          Add “{parsed.title}”
        </span>
      ),
      hint: '↵ add · Ctrl+↵ add and start',
      run: async ({ ctrl }) => {
        const input = createInput(parsed, { today: today || dueToday });
        const created = { id: '' };
        const ok = await actions.run(async () => {
          created.id = (await window.api.invoke('task:create', input)).id;
        });
        if (!ok) return;
        close();
        if (ctrl) await actions.start(created.id);
      },
    });
  }
  if (query) {
    for (const task of (tasks ?? [])
      .filter((t) => matchesQuery(searchText(t), query))
      .slice(0, 6)) {
      items.push({
        key: `task-${task.id}`,
        label: (
          <span className="flex min-w-0 items-center gap-2">
            {task.course && (
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: task.course.color }}
              />
            )}
            <span className="truncate">{task.title}</span>
            {task.running && <span className="text-xs text-emerald-600">running</span>}
          </span>
        ),
        hint: task.running ? '⇧↵ open' : '↵ start · ⇧↵ open',
        run: async ({ shift }) => {
          close();
          if (shift || task.running) navigate(`/tasks/${task.id}`);
          else await actions.start(task.id);
        },
      });
    }
  }
  const commands: Item[] = [];
  if (timer?.focus) {
    const focus = timer.focus;
    commands.push(
      { key: 'pause', label: `Pause “${focus.task.title}”`, run: after(() => actions.pause()) },
      {
        key: 'done',
        label: `Finish “${focus.task.title}”…`,
        run: after(() => actions.complete(focus.task)),
      },
      { key: 'stop', label: 'Stop the timer', run: after(() => actions.stop()) },
    );
  } else if (timer?.paused) {
    const paused = timer.paused;
    commands.push({
      key: 'resume',
      label: `Resume “${paused.task.title}”`,
      run: after(() => actions.resume()),
    });
  }
  commands.push({
    key: 'plan-week',
    label: 'Plan my week',
    hint: 'time-block the next 7 days',
    run: after(async () => {
      if (await actions.run(() => window.api.invoke('planner:plan-week'))) navigate('/calendar');
    }),
  });
  for (const route of routes) {
    commands.push({
      key: `go-${route.path}`,
      label: `Go to ${route.label}`,
      run: after(() => navigate(route.path)),
    });
  }
  commands.push({
    key: 'go-history',
    label: 'Go to Task history',
    run: after(() => navigate('/tasks/history')),
  });
  items.push(
    ...commands
      .filter((c) => !query || matchesQuery(String(c.label), query))
      .slice(0, query ? 4 : 12),
  );
  const active = Math.min(selected, Math.max(0, items.length - 1));

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setSelected((active + step + items.length) % Math.max(1, items.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void items[active]?.run({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
    }
  }

  return (
    <dialog
      ref={ref}
      // The native close event arrives after a tick; ignore it if the palette reopened since.
      onClose={() => !ref.current?.open && close()}
      aria-label="Command palette"
      className="mx-auto mt-[12vh] w-full max-w-xl rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-zinc-950/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      {open && (
        <div>
          <input
            autoFocus
            aria-label="Add a task, or search"
            className="w-full border-b border-zinc-200 bg-transparent px-4 py-3 text-base outline-none dark:border-zinc-800"
            placeholder="Add a task (Calc HW 3 fri 5pm ~1h #math @homework !) or search…"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSelected(0);
            }}
            onKeyDown={onKeyDown}
          />
          {parsed.title && (
            <div className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-2 dark:border-zinc-800">
              <QuickAddPreview parsed={parsed} courses={courses ?? []} />
              <label className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={today || dueToday}
                  disabled={dueToday}
                  onChange={(e) => setToday(e.target.checked)}
                />
                Add to Today
              </label>
            </div>
          )}
          <ul className="max-h-80 overflow-y-auto py-1">
            {items.map((item, index) => (
              <li key={item.key}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm',
                    index === active && 'bg-indigo-50 dark:bg-indigo-500/15',
                  )}
                  onMouseEnter={() => setSelected(index)}
                  onClick={(e) =>
                    void item.run({ shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey })
                  }
                >
                  <span className="min-w-0 truncate">{item.label}</span>
                  {item.hint && index === active && (
                    <span className="shrink-0 text-xs text-zinc-500">{item.hint}</span>
                  )}
                </button>
              </li>
            ))}
            {items.length === 0 && (
              <li className="px-4 py-3 text-sm text-zinc-500">Nothing matches.</li>
            )}
          </ul>
        </div>
      )}
    </dialog>
  );
}
