import FullCalendar, {
  type DatesSetInfo,
  type EventChangeInfo,
  type EventClickInfo,
  type EventDisplayInfo,
  type EventReceiveInfo,
} from '@fullcalendar/react';
import interactionPlugin from '@fullcalendar/react/interaction';
import breezyTheme from '@fullcalendar/react/themes/breezy';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/breezy/theme.css';
import '@fullcalendar/react/themes/breezy/palettes/indigo.css';
import type { OccurrenceView } from '@sa/core';
import { AlertTriangle, Lock, Moon, Repeat } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useColorScheme } from '../../lib/useColorScheme';
import { useLiveQuery } from '../../lib/useIpc';
import { useTaskActions } from '../timer/TaskActions';
import { BlockDialog, NewBlockDialog, OccurrenceDialog, type Span } from './BlockDialogs';
import { type CalendarItem, toEventInputs, weekAround } from './events';
import { formatDayText } from './routine';
import { TaskDragList } from './TaskDragList';

const PLUGINS = [timeGridPlugin, interactionPlugin, breezyTheme];
const TOOLBAR = { start: 'prev,next today', center: 'title', end: 'timeGridWeek,timeGridDay' };
const TIME_FORMAT = { hour: 'numeric', minute: '2-digit', meridiem: 'short' } as const;

const itemOf = (event: { extendedProps: Record<string, unknown> }) =>
  event.extendedProps.item as CalendarItem | undefined;

function EventContent({ info }: { info: EventDisplayInfo }) {
  const item = itemOf(info.event);
  if (!item) return <span className="truncate">{info.event.title}</span>;
  const detail =
    item.kind === 'fixed'
      ? [info.timeText, item.occurrence.location].filter(Boolean).join(' · ')
      : info.timeText;
  return (
    <div
      className="min-w-0 overflow-hidden px-1 py-0.5 text-xs leading-tight"
      style={item.kind === 'block' ? { color: '#fff' } : undefined}
    >
      <div className="flex items-center gap-1 font-medium">
        {item.kind === 'block' && item.block.locked && <Lock className="size-3 shrink-0" />}
        {item.kind === 'block' && item.block.conflict && (
          <AlertTriangle className="size-3 shrink-0" />
        )}
        {item.kind === 'fixed' && item.occurrence.kind === 'sleep' && (
          <Moon className="size-3 shrink-0" />
        )}
        <span className="truncate">{info.event.title}</span>
      </div>
      {!info.isShort && <div className="truncate opacity-80">{detail}</div>}
    </div>
  );
}

/** The week (or day): classes, sleep and meals from the routine, plus blocks planned by hand. */
export function CalendarPage() {
  const scheme = useColorScheme();
  const { run } = useTaskActions();
  const [range, setRange] = useState(() => weekAround(new Date()));
  const [scrollTime] = useState(
    () => `${String(Math.max(0, new Date().getHours() - 1)).padStart(2, '0')}:00:00`,
  );
  const { data, error } = useLiveQuery('calendar:range', range, `${range.from}|${range.to}`);
  const { data: routine } = useLiveQuery('fixed-event:list');
  const { data: today } = useLiveQuery('today:get');
  const { data: open } = useLiveQuery('task:list', { status: 'open' });
  const [selection, setSelection] = useState<Span | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [occurrence, setOccurrence] = useState<OccurrenceView | null>(null);

  const events = useMemo(() => (data ? toEventInputs(data) : []), [data]);
  const todayTasks = today?.tasks ?? [];
  const otherTasks = (open ?? []).filter((t) => t.todayOrder === null).slice(0, 40);
  const openBlock = data?.blocks.find((b) => b.id === blockId) ?? null;
  const thisYear = new Date().getFullYear();

  function onDatesSet(info: DatesSetInfo) {
    const next = { from: info.start.toISOString(), to: info.end.toISOString() };
    setRange((prev) => (prev.from === next.from && prev.to === next.to ? prev : next));
  }

  function onClick(info: EventClickInfo) {
    const item = itemOf(info.event);
    if (item?.kind === 'block') setBlockId(item.block.id);
    else if (item?.kind === 'fixed') setOccurrence(item.occurrence);
  }

  /** A block dragged or resized: save it, or snap back with the reason in the toast. */
  async function onChange(info: EventChangeInfo) {
    const item = itemOf(info.event);
    const { start, end } = info.event;
    if (item?.kind !== 'block' || !start || !end) {
      info.revert();
      return;
    }
    const ok = await run(() =>
      window.api.invoke('block:update', {
        id: item.block.id,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      }),
    );
    if (!ok) info.revert();
  }

  /** A task dropped from the list: the block comes back from the database, not from here. */
  async function onReceive(info: EventReceiveInfo) {
    const taskId = info.event.extendedProps.taskId as string | undefined;
    const { start, end } = info.event;
    info.revert();
    if (!taskId || !start || !end) return;
    await run(() =>
      window.api.invoke('block:create', {
        taskId,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      }),
    );
  }

  const missingSleep = data?.nightsWithoutSleep ?? [];
  const hasSleep = routine?.some((e) => e.kind === 'sleep') ?? true;

  return (
    <div className="flex h-full flex-col px-6 py-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Your routine in place; drag across free time or drop a task to plan it.
          </p>
        </div>
        <Link
          to="/calendar/routine"
          className="flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          <Repeat className="size-4" /> Routine
        </Link>
      </div>

      {routine && routine.length === 0 ? (
        <Banner>
          Start with your routine: classes, sleep and meals.{' '}
          <Link to="/calendar/routine" className="font-medium underline">
            Set it up
          </Link>
        </Banner>
      ) : !hasSleep ? (
        <Banner>
          Your routine has no sleep yet. Add it so the planner always protects 7.5 hours a night.{' '}
          <Link to="/calendar/routine" className="font-medium underline">
            Add sleep
          </Link>
        </Banner>
      ) : (
        missingSleep.length > 0 && (
          <Banner>
            No sleep in the routine on{' '}
            {missingSleep.map((d) => formatDayText(d, thisYear)).join(', ')}.
          </Banner>
        )
      )}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

      <div className="mt-4 flex min-h-0 flex-1 gap-4">
        <div className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          <FullCalendar
            plugins={PLUGINS}
            initialView="timeGridWeek"
            headerToolbar={TOOLBAR}
            firstDay={0}
            height="100%"
            allDaySlot={false}
            nowIndicator
            selectable
            selectMirror
            droppable
            slotDuration="00:30:00"
            snapDuration="00:05:00"
            scrollTime={scrollTime}
            eventTimeFormat={TIME_FORMAT}
            colorScheme={scheme}
            events={events}
            datesSet={onDatesSet}
            select={(info) => {
              setSelection({ startAt: info.start.toISOString(), endAt: info.end.toISOString() });
              info.view.calendar.unselect();
            }}
            eventClick={onClick}
            eventDrop={(info) => void onChange(info)}
            eventResize={(info) => void onChange(info)}
            eventReceive={(info) => void onReceive(info)}
            eventContent={(info: EventDisplayInfo) => <EventContent info={info} />}
          />
        </div>
        <aside className="w-60 shrink-0 overflow-y-auto">
          <TaskDragList todayTasks={todayTasks} otherTasks={otherTasks} />
        </aside>
      </div>

      <NewBlockDialog
        span={selection}
        todayTasks={todayTasks}
        otherTasks={otherTasks}
        onClose={() => setSelection(null)}
      />
      <BlockDialog block={openBlock} onClose={() => setBlockId(null)} />
      <OccurrenceDialog occurrence={occurrence} onClose={() => setOccurrence(null)} />
    </div>
  );
}

function Banner({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
      <Moon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}
