import { AlertTriangle } from 'lucide-react';
import { useLiveQuery, usePolling } from '../../lib/useIpc';
import { ReplanButton } from './PlanPanel';
import { behindText } from './planText';

/**
 * The plan is behind (owner decision Q13): a planned block has gone unworked past the grace.
 * Only a reminder; nothing moves until "Re-plan now".
 */
export function BehindBanner() {
  const { data: behind, reload } = useLiveQuery('planner:behind');
  // Lateness grows with the clock, not with changes.
  usePolling(reload, 30_000);
  if (!behind) return null;
  return (
    <div
      role="status"
      aria-label="Behind plan"
      className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-500/10 dark:text-amber-200"
    >
      <AlertTriangle className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">Behind plan:</span> {behindText(behind)} Nothing moves until
        you re-plan.
      </span>
      <ReplanButton />
    </div>
  );
}
