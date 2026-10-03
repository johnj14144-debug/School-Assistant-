import type { TaskListItem } from '@sa/core';
import { GripVertical } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/cn';
import { TaskRow } from '../tasks/TaskRow';
import { useTaskActions } from '../timer/TaskActions';
import { moveId } from './order';

/**
 * The Today list in the user's order. Drag a row by its handle, or focus the handle and press
 * Alt+↑ / Alt+↓.
 */
export function TodayList({ tasks, now }: { tasks: TaskListItem[]; now: Date }) {
  const { run } = useTaskActions();
  // While dragging, the order is local; it's saved on drop and replaced by the next load.
  const [order, setOrder] = useState<string[] | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  // A fresh load (after saving, or any other change) replaces the local order.
  const [loaded, setLoaded] = useState(tasks);
  if (tasks !== loaded) {
    setLoaded(tasks);
    setOrder(null);
  }

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ids = order ? order.filter((id) => byId.has(id)) : tasks.map((t) => t.id);

  function save(next: string[]) {
    setOrder(next);
    void run(() => window.api.invoke('today:reorder', { ids: next }));
  }

  return (
    <ol className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
      {ids.map((id, index) => {
        const task = byId.get(id);
        if (!task) return null;
        return (
          <li
            key={id}
            draggable={armed === id}
            data-testid="today-item"
            className={cn(dragging === id && 'opacity-50')}
            onDragStart={(e) => {
              setDragging(id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', id);
            }}
            onDragOver={(e) => {
              if (!dragging) return;
              e.preventDefault();
              if (dragging !== id) setOrder(moveId(ids, dragging, index));
            }}
            onDrop={(e) => e.preventDefault()}
            onDragEnd={() => {
              if (dragging && order) save(order);
              setDragging(null);
              setArmed(null);
            }}
          >
            <TaskRow
              task={task}
              now={now}
              leading={
                <button
                  type="button"
                  aria-label={`Move ${task.title} (Alt+Up or Alt+Down)`}
                  title="Drag to reorder (or Alt+↑ / Alt+↓)"
                  className="cursor-grab text-zinc-300 hover:text-zinc-500 dark:text-zinc-600"
                  onPointerDown={() => setArmed(id)}
                  onPointerUp={() => setArmed(null)}
                  onKeyDown={(e) => {
                    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
                    e.preventDefault();
                    const to = e.key === 'ArrowUp' ? index - 1 : index + 1;
                    if (to >= 0 && to < ids.length) save(moveId(ids, id, to));
                  }}
                >
                  <GripVertical className="size-4" />
                </button>
              }
            />
          </li>
        );
      })}
    </ol>
  );
}
