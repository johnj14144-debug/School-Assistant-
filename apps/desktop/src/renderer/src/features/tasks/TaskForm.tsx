import {
  type Assignment,
  DEFAULT_MIN_CHUNK_MIN,
  formatMinutes,
  formatSteps,
  parseDuration,
  parseSteps,
  stepTotals,
  type Task,
  type TaskAttention,
  type TaskPriority,
  type TaskStep,
} from '@sa/core';
import { type FormEvent, type ReactNode, useEffect, useId, useState } from 'react';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/inputs';
import { cn } from '../../lib/cn';
import {
  fromDateAndTime,
  fromDateTimeInput,
  toDateInput,
  toDateTimeInput,
  toTimeInput,
} from '../../lib/dates';
import { useIpcQuery } from '../../lib/useIpc';

export interface TaskFormValues {
  title: string;
  description: string;
  courseId: string | null;
  assignmentId: string | null;
  type: string;
  quantity: number | null;
  unit: string;
  estimateMin: number | null;
  dueAt: string | null;
  priority: TaskPriority;
  attention: TaskAttention;
  earliestStartAt: string | null;
  splittable: boolean;
  minChunkMin: number;
  allowLate: boolean;
  steps: TaskStep[];
  /** Create only: also put it on the Today list. */
  today: boolean;
}

export const DEFAULT_TYPES = [
  'homework',
  'reading',
  'studying',
  'writing',
  'project',
  'exam prep',
  'lab',
  'review',
  'chore',
  'errand',
];
export const UNITS = [
  'problems',
  'pages',
  'questions',
  'exercises',
  'chapters',
  'sections',
  'words',
  'slides',
  'cards',
  'videos',
  'lectures',
];

interface TaskFormProps {
  /** Editing an existing task; left out when creating. */
  task?: Task;
  /** Prefill for a new task (e.g. a subtask's parent course). */
  initial?: Partial<TaskFormValues>;
  submitLabel: string;
  /** Resolves to whether it saved. */
  onSubmit: (values: TaskFormValues) => Promise<boolean>;
  onCancel?: () => void;
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed in as children.
    <label className={cn('flex flex-col gap-1 text-sm', className)}>
      <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
    </label>
  );
}

/** Every field of a task. Estimates are typed like "1h 30m"; due dates in local time. */
export function TaskForm({ task, initial, submitLabel, onSubmit, onCancel }: TaskFormProps) {
  const listId = useId();
  const { data: courses } = useIpcQuery('course:list');
  const { data: usedTypes } = useIpcQuery('task:types');
  const [title, setTitle] = useState(task?.title ?? initial?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [courseId, setCourseId] = useState(task?.courseId ?? initial?.courseId ?? null);
  const [assignmentId, setAssignmentId] = useState(task?.assignmentId ?? null);
  const [type, setType] = useState(task?.type ?? initial?.type ?? '');
  const [quantity, setQuantity] = useState(task?.quantity?.toString() ?? '');
  const [unit, setUnit] = useState(task?.unit ?? '');
  const [estimate, setEstimate] = useState(
    task?.estimateMin != null ? formatMinutes(task.estimateMin) : '',
  );
  const dueAt = task?.dueAt ?? initial?.dueAt ?? null;
  const [dueDate, setDueDate] = useState(toDateInput(dueAt));
  const isEndOfDay = dueAt !== null && toTimeInput(dueAt) === '23:59';
  const [dueTime, setDueTime] = useState(isEndOfDay ? '' : toTimeInput(dueAt));
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? 'normal');
  const [attention, setAttention] = useState<TaskAttention>(task?.attention ?? 'focus');
  const [today, setToday] = useState(initial?.today ?? false);
  const [earliestStart, setEarliestStart] = useState(
    toDateTimeInput(task?.earliestStartAt ?? null),
  );
  const [oneSitting, setOneSitting] = useState(task ? !task.splittable : false);
  const [minChunk, setMinChunk] = useState(
    formatMinutes(task?.minChunkMin ?? DEFAULT_MIN_CHUNK_MIN),
  );
  const [allowLate, setAllowLate] = useState(task?.allowLate ?? false);
  const [stepsText, setStepsText] = useState(task ? formatSteps(task.steps) : '');
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  useEffect(() => {
    if (!courseId) {
      setAssignments([]);
      return;
    }
    let live = true;
    void window.api
      .invoke('course:get', { id: courseId })
      .then((detail) => live && setAssignments(detail.assignments))
      .catch(() => live && setAssignments([]));
    return () => {
      live = false;
    };
  }, [courseId]);

  const estimateMin = parseDuration(estimate);
  const estimateError = estimate.trim() !== '' && estimateMin === null;
  const quantityValue = quantity.trim() === '' ? null : Number(quantity);
  const quantityError = quantityValue !== null && !(quantityValue >= 0);
  const types = [...new Set([...(usedTypes ?? []), ...DEFAULT_TYPES])];
  const minChunkMin = parseDuration(minChunk);
  const minChunkError = minChunkMin === null || minChunkMin < 5 || minChunkMin > 480;
  const steps = parseSteps(stepsText);
  const planningChanged =
    task !== undefined &&
    (task.earliestStartAt !== null ||
      !task.splittable ||
      task.minChunkMin !== DEFAULT_MIN_CHUNK_MIN ||
      task.allowLate ||
      task.steps.length > 0);

  function pickAssignment(id: string | null) {
    setAssignmentId(id);
    const assignment = assignments.find((a) => a.id === id);
    if (!assignment) return;
    if (!title.trim()) setTitle(assignment.title);
    if (!dueDate && assignment.dueAt) {
      setDueDate(toDateInput(assignment.dueAt));
      const time = toTimeInput(assignment.dueAt);
      setDueTime(time === '23:59' ? '' : time);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (estimateError || quantityError || minChunkError || !steps.ok) return;
    await onSubmit({
      title,
      description,
      courseId,
      assignmentId,
      type,
      quantity: quantityValue,
      unit,
      estimateMin,
      dueAt: fromDateAndTime(dueDate, dueTime),
      priority,
      attention,
      earliestStartAt: fromDateTimeInput(earliestStart),
      splittable: !oneSitting,
      minChunkMin: minChunkMin ?? DEFAULT_MIN_CHUNK_MIN,
      allowLate,
      steps: steps.ok ? steps.steps : [],
      today,
    });
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid grid-cols-6 gap-4">
      <Field label="Title" className="col-span-6">
        <input
          className={inputClass}
          // biome-ignore lint/a11y/noAutofocus: the form opens to type a task.
          autoFocus={!task}
          required
          maxLength={200}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </Field>
      <Field label="Course" className="col-span-3">
        <select
          className={inputClass}
          value={courseId ?? ''}
          onChange={(e) => {
            setCourseId(e.target.value || null);
            setAssignmentId(null);
          }}
        >
          <option value="">None</option>
          {courses?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code ? `${c.code} · ${c.name}` : c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Assignment" className="col-span-3">
        <select
          className={inputClass}
          disabled={!courseId}
          value={assignmentId ?? ''}
          onChange={(e) => pickAssignment(e.target.value || null)}
        >
          <option value="">{courseId ? 'None' : 'Pick a course first'}</option>
          {assignments.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Type" className="col-span-2">
        <input
          className={inputClass}
          list={`${listId}-types`}
          placeholder="homework"
          maxLength={40}
          value={type}
          onChange={(e) => setType(e.target.value)}
        />
        <datalist id={`${listId}-types`}>
          {types.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Field>
      <Field label="How much" className="col-span-2">
        <div className="flex gap-1">
          <input
            className={cn(inputClass, 'w-16 min-w-0', quantityError && 'border-red-400')}
            inputMode="decimal"
            placeholder="12"
            aria-label="Quantity"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <input
            className={cn(inputClass, 'min-w-0 flex-1')}
            list={`${listId}-units`}
            placeholder="problems"
            aria-label="Unit"
            maxLength={30}
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
          />
          <datalist id={`${listId}-units`}>
            {UNITS.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
        </div>
      </Field>
      <Field label="Estimate" className="col-span-2">
        <input
          className={cn(inputClass, estimateError && 'border-red-400')}
          placeholder="1h 30m"
          aria-invalid={estimateError || undefined}
          value={estimate}
          onChange={(e) => setEstimate(e.target.value)}
        />
        {estimateError && <span className="text-xs text-red-600">Try 45m, 1h30 or 2h</span>}
      </Field>
      <Field label="Due" className="col-span-3">
        <div className="flex gap-1">
          <input
            type="date"
            className={cn(inputClass, 'min-w-0 flex-1')}
            aria-label="Due date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
          <input
            type="time"
            className={cn(inputClass, 'w-28')}
            aria-label="Due time"
            title="Leave empty for 11:59 pm"
            disabled={!dueDate}
            value={dueTime}
            onChange={(e) => setDueTime(e.target.value)}
          />
        </div>
      </Field>
      <Field label="Priority" className="col-span-1">
        <select
          className={inputClass}
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
        >
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </Field>
      <Field label="Attention" className="col-span-2">
        <select
          className={inputClass}
          value={attention}
          onChange={(e) => setAttention(e.target.value as TaskAttention)}
          title="Background tasks (laundry) can be timed alongside a focus task"
        >
          <option value="focus">Focus</option>
          <option value="light">Light</option>
          <option value="background">Background (runs alongside)</option>
        </select>
      </Field>
      <details
        className="col-span-6 rounded-md border border-zinc-200 px-3 py-2 dark:border-zinc-800"
        open={planningChanged}
      >
        <summary className="cursor-pointer text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Planning
        </summary>
        <div className="mt-3 grid grid-cols-6 gap-4">
          <Field label="Not before" className="col-span-3">
            <input
              type="datetime-local"
              className={inputClass}
              aria-label="Earliest start"
              value={earliestStart}
              onChange={(e) => setEarliestStart(e.target.value)}
            />
          </Field>
          <Field label="Shortest block" className="col-span-3">
            <input
              className={cn(inputClass, minChunkError && 'border-red-400')}
              aria-label="Shortest block"
              placeholder="30m"
              aria-invalid={minChunkError || undefined}
              value={minChunk}
              onChange={(e) => setMinChunk(e.target.value)}
            />
            {minChunkError && <span className="text-xs text-red-600">5m to 8h</span>}
          </Field>
          <label className="col-span-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={oneSitting}
              onChange={(e) => setOneSitting(e.target.checked)}
            />
            Do it in one sitting
          </label>
          <label className="col-span-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowLate}
              onChange={(e) => setAllowLate(e.target.checked)}
            />
            If it can't be done in time, plan the rest after the due date
          </label>
          <Field label="Steps (for tasks with waiting, like laundry)" className="col-span-6">
            <input
              className={cn(inputClass, !steps.ok && 'border-red-400')}
              aria-label="Steps"
              placeholder="Load the washer 5m, wait 45m, Move to the dryer 5m, wait 1h, Fold 15m"
              aria-invalid={!steps.ok || undefined}
              value={stepsText}
              onChange={(e) => setStepsText(e.target.value)}
            />
            {steps.ok ? (
              steps.steps.length > 0 && (
                <span className="text-xs text-zinc-500">
                  {stepsSummary(steps.steps)}. Waits run alongside other work; the planner uses the
                  steps instead of the estimate.
                </span>
              )
            ) : (
              <span className="text-xs text-red-600">{steps.error}</span>
            )}
          </Field>
        </div>
      </details>
      <Field label="Notes" className="col-span-6">
        <textarea
          className={cn(inputClass, 'resize-y')}
          rows={3}
          maxLength={10_000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <div className="col-span-6 flex items-center justify-end gap-2">
        {!task && (
          <label className="mr-auto flex items-center gap-2 text-sm">
            <input type="checkbox" checked={today} onChange={(e) => setToday(e.target.checked)} />
            Add to Today
          </label>
        )}
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
        <Button type="submit" variant="primary" disabled={!title.trim()}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function stepsSummary(steps: TaskStep[]): string {
  const { handsOnMin, totalMin } = stepTotals(steps);
  const count = steps.length === 1 ? '1 step' : `${steps.length} steps`;
  return `${count}: ${formatMinutes(handsOnMin)} hands-on, ${formatMinutes(totalMin)} from start to finish`;
}
