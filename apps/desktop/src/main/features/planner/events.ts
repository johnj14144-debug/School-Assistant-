/**
 * Something that changes what the plan should be (M6). Task, timer and calendar services report
 * these; the planner re-plans when a plan exists.
 *
 * - `edit`: tasks, logged time, the routine or blocks changed by hand.
 * - `finish`: tasks were finished or their timer stopped at `at` (early finish, owner decision
 *   Q12): their blocks end there and the rest of the day is re-packed.
 */
export type PlanEvent = { kind: 'edit' } | { kind: 'finish'; taskIds: string[]; at: string };

export type PlanEventListener = (event: PlanEvent) => void;
