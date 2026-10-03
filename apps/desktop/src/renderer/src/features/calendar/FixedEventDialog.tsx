import { type CourseSummary, DEFAULT_TIME_ZONE, type FixedEventKind } from '@sa/core';
import { type FormEvent, useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { Dialog } from '../../components/Dialog';
import { inputClass } from '../../components/inputs';
import { cn } from '../../lib/cn';
import {
  type FixedEventForm,
  inputFromForm,
  KIND_LABELS,
  type RepeatKind,
  WEEKDAY_ORDER,
  WEEKDAY_SHORT,
} from './routine';
import { useDialogAction } from './useDialogAction';

export interface Editing {
  /** null when adding. */
  id: string | null;
  form: FixedEventForm;
}

interface FixedEventDialogProps {
  editing: Editing | null;
  courses: CourseSummary[];
  onClose: () => void;
}

/** Add or edit a class, sleep, meal, routine item or other recurring event. */
export function FixedEventDialog({ editing, courses, onClose }: FixedEventDialogProps) {
  const label = editing ? KIND_LABELS[editing.form.kind].toLowerCase() : '';
  return (
    <Dialog
      open={editing !== null}
      onClose={onClose}
      title={editing?.id ? `Edit ${editing.form.title}` : `Add ${label}`}
      className="max-w-lg"
    >
      {editing && (
        <Fields
          key={editing.id ?? `new-${editing.form.kind}`}
          editing={editing}
          courses={courses}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

const fieldLabel = 'text-zinc-600 dark:text-zinc-400';

function Fields({ editing, courses, onClose }: FixedEventDialogProps & { editing: Editing }) {
  const [form, setForm] = useState(editing.form);
  const [formError, setFormError] = useState<string | null>(null);
  const { error, busy, act } = useDialogAction();
  const zones = useMemo(() => {
    const all = Intl.supportedValuesOf('timeZone');
    return all.includes(form.timeZone) ? all : [form.timeZone, ...all];
  }, [form.timeZone]);
  const set = (patch: Partial<FixedEventForm>) => setForm((f) => ({ ...f, ...patch }));
  const courseLabel = (id: string) => {
    const c = courses.find((course) => course.id === id);
    return c ? c.code || c.name : '';
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    let input: ReturnType<typeof inputFromForm>;
    try {
      input = inputFromForm(form);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
      return;
    }
    setFormError(null);
    const ok = await act(() =>
      editing.id
        ? window.api.invoke('fixed-event:update', { id: editing.id, ...input })
        : window.api.invoke('fixed-event:create', input),
    );
    if (ok) onClose();
  }

  const overnight = form.endLocal <= form.startLocal;
  return (
    <form onSubmit={(e) => void submit(e)} className="mt-4 grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm">
          <span className={fieldLabel}>Kind</span>
          <select
            className={inputClass}
            value={form.kind}
            onChange={(e) => set({ kind: e.target.value as FixedEventKind })}
          >
            {Object.entries(KIND_LABELS).map(([kind, text]) => (
              <option key={kind} value={kind}>
                {text}
              </option>
            ))}
          </select>
        </label>
        {form.kind === 'class' && (
          <label className="grid gap-1 text-sm">
            <span className={fieldLabel}>Course (Grade Calc)</span>
            <select
              className={inputClass}
              value={form.courseId}
              onChange={(e) => {
                const courseId = e.target.value;
                // Fill the title from the course unless the user typed their own.
                const keepTitle = form.title && form.title !== courseLabel(form.courseId);
                set({ courseId, ...(keepTitle ? {} : { title: courseLabel(courseId) }) });
              }}
            >
              <option value="">None</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code ? `${c.code} · ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="grid grid-cols-[1fr_10rem] gap-3">
        <label className="grid gap-1 text-sm">
          <span className={fieldLabel}>Title</span>
          <input
            className={inputClass}
            value={form.title}
            placeholder={form.kind === 'class' ? 'MATH 2413' : 'Gym'}
            onChange={(e) => set({ title: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className={fieldLabel}>Location</span>
          <input
            className={inputClass}
            value={form.location}
            placeholder={form.kind === 'class' ? 'PGH 232' : ''}
            onChange={(e) => set({ location: e.target.value })}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm">
          <span className={fieldLabel}>Starts</span>
          <input
            type="time"
            className={inputClass}
            value={form.startLocal}
            onChange={(e) => e.target.value && set({ startLocal: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className={fieldLabel}>Ends {overnight && '(next day)'}</span>
          <input
            type="time"
            className={inputClass}
            value={form.endLocal}
            onChange={(e) => e.target.value && set({ endLocal: e.target.value })}
          />
        </label>
      </div>
      <label className="grid gap-1 text-sm">
        <span className={fieldLabel}>Repeats</span>
        <select
          className={inputClass}
          value={form.repeat}
          onChange={(e) => set({ repeat: e.target.value as RepeatKind })}
        >
          <option value="daily">Every day</option>
          <option value="weekly">Weekly, on certain days</option>
          <option value="once">Once</option>
        </select>
      </label>
      {form.repeat === 'weekly' && (
        <div className="flex flex-wrap items-center gap-1.5">
          {WEEKDAY_ORDER.map((day) => {
            const on = form.days.includes(day);
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                className={cn(
                  'w-11 rounded-md border px-2 py-1 text-sm',
                  on
                    ? 'border-indigo-600 bg-indigo-600 text-white'
                    : 'border-zinc-300 bg-white hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800',
                )}
                onClick={() =>
                  set({ days: on ? form.days.filter((d) => d !== day) : [...form.days, day] })
                }
              >
                {WEEKDAY_SHORT[day]}
              </button>
            );
          })}
          <label className="ml-2 flex items-center gap-1.5 text-sm">
            every
            <input
              type="number"
              min={1}
              max={52}
              className={cn(inputClass, 'w-14')}
              value={form.interval}
              onChange={(e) => set({ interval: Number(e.target.value) || 1 })}
              aria-label="Every how many weeks"
            />
            {form.interval === 1 ? 'week' : 'weeks'}
          </label>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1 text-sm">
          <span className={fieldLabel}>{form.repeat === 'once' ? 'Day' : 'First day'}</span>
          <input
            type="date"
            className={inputClass}
            value={form.startDate}
            onChange={(e) => set({ startDate: e.target.value })}
          />
        </label>
        {form.repeat !== 'once' && (
          <label className="grid gap-1 text-sm">
            <span className={fieldLabel}>Last day (optional)</span>
            <input
              type="date"
              className={inputClass}
              value={form.lastDay}
              onChange={(e) => set({ lastDay: e.target.value })}
            />
          </label>
        )}
      </div>
      <label className="grid gap-1 text-sm">
        <span className={fieldLabel}>
          Time zone {form.timeZone === DEFAULT_TIME_ZONE && '(Houston)'}
        </span>
        <select
          className={inputClass}
          value={form.timeZone}
          onChange={(e) => set({ timeZone: e.target.value })}
        >
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <span className="text-xs text-zinc-500">
          The event stays at these times in this zone, through daylight saving and travel.
        </span>
      </label>
      {(formError ?? error) && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {formError ?? error}
        </p>
      )}
      <div className="mt-2 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={busy}>
          {editing.id ? 'Save' : 'Add'}
        </Button>
      </div>
    </form>
  );
}
