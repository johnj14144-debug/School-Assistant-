import type { PlannerPreferences } from '../../../../shared/ipc';
import { inputClass } from '../../components/inputs';
import { cn } from '../../lib/cn';
import { useIpcQuery } from '../../lib/useIpc';
import { useTaskActions } from '../timer/TaskActions';

const BLOCK_CHOICES = [45, 60, 75, 90, 120, 150, 180];
const BREAK_CHOICES = [0, 5, 10, 15, 20, 30];
const ESTIMATE_CHOICES = [15, 30, 45, 60, 90, 120, 180];

const minutesText = (m: number) =>
  m < 60 || m % 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? 's' : ''}`;

/**
 * How the planner cuts up work (the longest focus block, the break between blocks) and how long
 * it plans a task that has no estimate.
 */
export function PlannerSection() {
  const { run } = useTaskActions();
  const { data, reload } = useIpcQuery('planner:preferences');

  async function save(patch: Partial<PlannerPreferences>) {
    await run(() => window.api.invoke('planner:set-preferences', patch));
    await reload();
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">Planner</h2>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Used by “Plan my week”. A task set to one sitting may get a longer block. Tasks without an
        estimate are planned for the default length until you give them one.
      </p>
      <div className="mt-4 flex flex-wrap gap-6 text-sm">
        <label className="grid gap-1">
          <span className="text-zinc-600 dark:text-zinc-400">Longest focus block</span>
          <select
            className={cn(inputClass, 'w-40')}
            value={data?.maxChunkMin ?? 90}
            disabled={!data}
            onChange={(e) => void save({ maxChunkMin: Number(e.target.value) })}
          >
            {BLOCK_CHOICES.map((m) => (
              <option key={m} value={m}>
                {minutesText(m)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-zinc-600 dark:text-zinc-400">Break between blocks</span>
          <select
            className={cn(inputClass, 'w-40')}
            value={data?.breakMin ?? 10}
            disabled={!data}
            onChange={(e) => void save({ breakMin: Number(e.target.value) })}
          >
            {BREAK_CHOICES.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'None' : `${m} minutes`}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-zinc-600 dark:text-zinc-400">Task without an estimate</span>
          <select
            className={cn(inputClass, 'w-40')}
            value={data?.defaultEstimateMin ?? 60}
            disabled={!data}
            onChange={(e) => void save({ defaultEstimateMin: Number(e.target.value) })}
          >
            {ESTIMATE_CHOICES.map((m) => (
              <option key={m} value={m}>
                {minutesText(m)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
