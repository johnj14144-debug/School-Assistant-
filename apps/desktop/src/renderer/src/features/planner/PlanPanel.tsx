import type { PlanOption, PlanWarning } from '@sa/core';
import { AlertTriangle, Clock, Eraser, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { useLiveQuery } from '../../lib/useIpc';
import { useNow } from '../../lib/useNow';
import { useTaskActions } from '../timer/TaskActions';
import { changeText, groupWarnings, OPTION_LABELS, plannedAt, runSummary } from './planText';

/** Plans the week (and, for an option, changes the task first); errors go to the toast. */
export function usePlanWeek() {
  const { run } = useTaskActions();
  const navigate = useNavigate();
  const [planning, setPlanning] = useState(false);

  async function plan(before?: () => Promise<unknown>) {
    setPlanning(true);
    try {
      return await run(async () => {
        if (before) await before();
        await window.api.invoke('planner:plan-week');
      });
    } finally {
      setPlanning(false);
    }
  }

  function choose(warning: PlanWarning, option: PlanOption) {
    const id = warning.taskId;
    if (option === 'edit-task') navigate(`/tasks/${id}`);
    else if (option === 'make-soft') {
      void plan(() => window.api.invoke('task:update', { id, deadline: 'soft' }));
    } else void plan(() => window.api.invoke('task:update', { id, splittable: true }));
  }

  return { plan, planning, choose };
}

export function PlanWeekButton({
  label = 'Plan my week',
  variant = 'primary',
}: {
  label?: string;
  variant?: 'primary' | 'secondary';
}) {
  const { plan, planning } = usePlanWeek();
  return (
    <Button
      variant={variant}
      className="flex items-center gap-1.5"
      disabled={planning}
      onClick={() => void plan()}
      title="A fresh plan: time-block the next 7 days from your tasks' due dates and estimates"
    >
      <Sparkles className="size-4" /> {planning ? 'Planning…' : label}
    </Button>
  );
}

/** "Re-plan now" (M6): keeps what still works, moves what must. The toast says what moved. */
export function ReplanButton({ variant = 'primary' }: { variant?: 'primary' | 'secondary' }) {
  const { run } = useTaskActions();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      className="flex items-center gap-1.5"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await run(() => window.api.invoke('planner:replan'));
        } finally {
          setBusy(false);
        }
      }}
      title="Keep what still works and move only what must, from now on"
    >
      <RefreshCw className="size-4" /> {busy ? 'Re-planning…' : 'Re-plan now'}
    </Button>
  );
}

/** The Calendar's plan buttons: "Re-plan now" leads once there is a plan. */
export function PlanButtons() {
  const { data: last } = useLiveQuery('planner:last-run');
  return last ? (
    <>
      <ReplanButton />
      <PlanWeekButton variant="secondary" />
      <ClearPlanButton />
    </>
  ) : (
    <PlanWeekButton />
  );
}

export function ClearPlanButton() {
  const { run } = useTaskActions();
  return (
    <Button
      className="flex items-center gap-1.5"
      onClick={() => {
        if (!window.confirm("Remove the planner's blocks from now on? Locked blocks stay.")) return;
        void run(() => window.api.invoke('planner:clear'));
      }}
      title="Remove the planner's future blocks (yours and locked ones stay)"
    >
      <Eraser className="size-4" /> Clear plan
    </Button>
  );
}

/** The last plan: what it planned, and what it couldn't, with ways out. */
export function PlanPanel() {
  const { data: run } = useLiveQuery('planner:last-run');
  const now = useNow(60_000);
  const { choose, planning } = usePlanWeek();
  if (!run) return null;
  const { problems, late, unplanned } = groupWarnings(run.warnings);

  return (
    <section
      aria-label="Plan"
      className="mt-3 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <p className="flex flex-wrap items-center gap-x-2">
        <Sparkles className="size-4 text-indigo-600 dark:text-indigo-400" />
        <span className="font-medium">{runSummary(run)}</span>
        <span className="text-zinc-500">{plannedAt(run, now)}</span>
      </p>
      {problems.length > 0 && (
        <ul className="mt-2 grid gap-2">
          {problems.map((w) => (
            <li
              key={`${w.kind}-${w.taskId}`}
              className="rounded-md bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
            >
              <p className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>{w.message}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2 pl-6">
                {w.options.map((option) => (
                  <Button
                    key={option}
                    disabled={planning && option !== 'edit-task'}
                    onClick={() => choose(w, option)}
                  >
                    {OPTION_LABELS[option]}
                  </Button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
      {late.length > 0 && (
        <ul className="mt-2 grid gap-1 text-sky-900 dark:text-sky-200">
          {late.map((w) => (
            <li key={`late-${w.taskId}`} className="flex items-start gap-2">
              <Clock className="mt-0.5 size-4 shrink-0" />
              <span>
                {w.message}{' '}
                <Link to={`/tasks/${w.taskId}`} className="underline">
                  Edit
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
      {run.trigger !== 'plan' && run.changes.length > 0 && (
        <details className="mt-2 text-zinc-600 dark:text-zinc-400">
          <summary className="cursor-pointer">What moved ({run.changes.length})</summary>
          <ul className="mt-1 grid gap-0.5 pl-4">
            {run.changes.map((c) => (
              <li key={c.taskId}>{changeText(c, now)}</li>
            ))}
          </ul>
        </details>
      )}
      {unplanned.length > 0 && (
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Not planned ({unplanned.length}):{' '}
          {unplanned.map((w, i) => (
            <span key={w.taskId}>
              {i > 0 && ', '}
              <Link
                to={`/tasks/${w.taskId}`}
                className="text-indigo-700 hover:underline dark:text-indigo-300"
                title={w.message}
              >
                {w.title}
              </Link>
              {' (estimate used up)'}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
