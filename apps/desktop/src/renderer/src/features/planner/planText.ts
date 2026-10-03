import {
  formatMinutes,
  type PlanBehind,
  type PlanChange,
  type PlanOption,
  type PlanRun,
  type PlanTrigger,
  type PlanWarning,
} from '@sa/core';

/** Words for the planner's summary and warnings. Pure, so it can be unit-tested. */

const dayFormat: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' };

/** "Planned 23 blocks, 31h 20m of work, through Sun, Oct 11." */
export function runSummary(run: PlanRun): string {
  // `until` is midnight after the last day.
  const lastDay = new Date(Date.parse(run.until) - 1).toLocaleDateString(undefined, dayFormat);
  if (run.blockCount === 0) return `Nothing to plan through ${lastDay}.`;
  const blocks = run.blockCount === 1 ? '1 block' : `${run.blockCount} blocks`;
  return `Planned ${blocks}, ${formatMinutes(run.plannedMin)} of work, through ${lastDay}.`;
}

/** Why the plan last changed, after "Re-planned at 9:31 AM". */
const TRIGGER_TEXT: Record<PlanTrigger, string> = {
  plan: '',
  manual: '',
  finish: ' after a task ended early',
  overrun: ' as a task ran over',
  edit: ' after a change',
};

/**
 * "Planned at 8:05 AM", "Re-planned at 9:31 AM after a task ended early", or with the date
 * ("Planned Oct 5, 8:05 AM") on another day.
 */
export function plannedAt(run: PlanRun, now: Date): string {
  const at = new Date(run.at);
  const verb = run.trigger === 'plan' ? 'Planned' : 'Re-planned';
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const when =
    at.toDateString() === now.toDateString()
      ? `at ${time}`
      : `${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
  return `${verb} ${when}${TRIGGER_TEXT[run.trigger]}`;
}

/** "9:30 AM" today, else "Thu 2:00 PM". */
export function shortWhen(iso: string, now: Date): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
}

/** One line per task a re-plan changed: "Calc HW: 9:00 AM → 9:30 AM". */
export function changeText(change: PlanChange, now: Date): string {
  const { title, from, to } = change;
  switch (change.kind) {
    case 'added':
      return `${title}: planned ${shortWhen(to ?? '', now)}`;
    case 'removed':
      return `${title}: no longer planned at ${shortWhen(from ?? '', now)}`;
    case 'moved':
      return from === to
        ? `${title}: ${shortWhen(from ?? '', now)} block changed length`
        : `${title}: ${shortWhen(from ?? '', now)} → ${shortWhen(to ?? '', now)}`;
  }
}

/**
 * The toast after a re-plan: a heading and up to `max` lines (then "and 2 more"). Null when an
 * automatic re-plan changed nothing (no news); "Re-plan now" always answers.
 */
export function replanToast(
  run: PlanRun,
  now: Date,
  max = 4,
): { heading: string; lines: string[] } | null {
  if (run.changes.length === 0) {
    return run.trigger === 'manual'
      ? { heading: 'Re-planned: nothing had to move.', lines: [] }
      : null;
  }
  const heading =
    run.trigger === 'manual' ? 'Re-planned' : `Plan updated${TRIGGER_TEXT[run.trigger]}`;
  const lines = run.changes.slice(0, max).map((c) => changeText(c, now));
  const more = run.changes.length - max;
  if (more > 0) lines.push(`and ${more} more`);
  return { heading, lines };
}

/** "Calc HW should have started 25 min ago." */
export function behindText(behind: PlanBehind): string {
  const late = behind.lateMin < 60 ? `${behind.lateMin} min` : formatMinutes(behind.lateMin);
  return behind.stopped
    ? `${behind.title} was planned for now, but it stopped ${late} ago.`
    : `${behind.title} should have started ${late} ago.`;
}

export const OPTION_LABELS: Record<PlanOption, string> = {
  'make-soft': 'Make the deadline soft',
  'allow-split': 'Let it be split',
  'edit-task': 'Edit task',
};

export interface WarningGroups {
  /** Work that misses a hard due date or fits nowhere. */
  problems: PlanWarning[];
  /** Soft deadlines the plan doesn't meet. */
  late: PlanWarning[];
  /** Not planned: the estimate is used up. */
  unplanned: PlanWarning[];
}

export function groupWarnings(warnings: readonly PlanWarning[]): WarningGroups {
  const groups: WarningGroups = { problems: [], late: [], unplanned: [] };
  for (const w of warnings) {
    if (w.kind === 'late') groups.late.push(w);
    else if (w.kind === 'spent') groups.unplanned.push(w);
    else groups.problems.push(w);
  }
  return groups;
}
