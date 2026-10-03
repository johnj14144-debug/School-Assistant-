import { Draggable } from '@fullcalendar/react/interaction';
import { formatMinutes, type TaskListItem } from '@sa/core';
import { GripVertical } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { blockMinutesFor } from './events';

function DragItem({ task }: { task: TaskListItem }) {
  const minutes = blockMinutesFor(task);
  return (
    <div
      data-task-id={task.id}
      data-title={task.title}
      data-minutes={minutes}
      className="flex cursor-grab items-start gap-1.5 rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-sm hover:border-indigo-300 active:cursor-grabbing dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
      style={task.course ? { borderLeft: `3px solid ${task.course.color}` } : undefined}
      title="Drag onto the calendar"
    >
      <GripVertical className="mt-0.5 size-3.5 shrink-0 text-zinc-400" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{task.title}</span>
        <span className="text-xs text-zinc-500">
          {task.course ? `${task.course.code || task.course.name} · ` : ''}
          {formatMinutes(minutes)}
        </span>
      </span>
    </div>
  );
}

/** Tasks to drag onto the calendar: the Today list first, then the other open tasks. */
export function TaskDragList({
  todayTasks,
  otherTasks,
}: {
  todayTasks: TaskListItem[];
  otherTasks: TaskListItem[];
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const draggable = new Draggable(ref.current, {
      itemSelector: '[data-task-id]',
      eventData: (el) => ({
        title: el.dataset.title ?? '',
        duration: { minutes: Number(el.dataset.minutes) || 60 },
        taskId: el.dataset.taskId,
        create: true,
      }),
    });
    return () => draggable.destroy();
  }, []);

  return (
    <div ref={ref} className="grid gap-4">
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Today’s list
        </h2>
        <div className="mt-2 grid gap-1.5">
          {todayTasks.map((t) => (
            <DragItem key={t.id} task={t} />
          ))}
          {todayTasks.length === 0 && (
            <p className="text-xs text-zinc-500">Nothing on today’s list.</p>
          )}
        </div>
      </section>
      {otherTasks.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Other open tasks
          </h2>
          <div className="mt-2 grid gap-1.5">
            {otherTasks.map((t) => (
              <DragItem key={t.id} task={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
