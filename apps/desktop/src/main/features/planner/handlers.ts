import type { HandlersFor } from '../../ipc';
import type { PlannerService } from './service';

export function plannerHandlers(planner: PlannerService): HandlersFor<'planner'> {
  return {
    'planner:plan-week': () => planner.planWeek(),
    'planner:replan': () => planner.replan('manual'),
    'planner:behind': () => planner.behind(),
    'planner:clear': () => planner.clear(),
    'planner:last-run': () => planner.lastRun(),
    'planner:preferences': () => planner.preferences(),
    'planner:set-preferences': (input) => planner.setPreferences(input),
  };
}
