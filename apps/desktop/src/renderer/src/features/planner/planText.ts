import { formatMinutes, type PlanOption, type PlanRun, type PlanWarning } from '@sa/core';

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

/** "Planned at 8:05 AM", or "Planned Oct 5, 8:05 AM" on another day. */
export function plannedAt(run: PlanRun, now: Date): string {
  const at = new Date(run.at);
  const time = at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (at.toDateString() === now.toDateString()) return `Planned at ${time}`;
  return `Planned ${at.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}, ${time}`;
}

export const OPTION_LABELS: Record<PlanOption, string> = {
  'plan-late': 'Plan the rest after the due date',
  'allow-split': 'Let it be split',
  'edit-task': 'Edit task',
};

export interface WarningGroups {
  /** Work that misses its due date or fits nowhere. */
  problems: PlanWarning[];
  /** Planned after the due date, as the task allows. */
  late: PlanWarning[];
  /** Not planned: no estimate, or the estimate is used up. */
  unplanned: PlanWarning[];
}

export function groupWarnings(warnings: readonly PlanWarning[]): WarningGroups {
  const groups: WarningGroups = { problems: [], late: [], unplanned: [] };
  for (const w of warnings) {
    if (w.kind === 'late') groups.late.push(w);
    else if (w.kind === 'no-estimate' || w.kind === 'spent') groups.unplanned.push(w);
    else groups.problems.push(w);
  }
  return groups;
}
