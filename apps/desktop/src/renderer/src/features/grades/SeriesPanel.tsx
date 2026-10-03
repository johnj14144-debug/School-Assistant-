import { type CourseDetail, MAX_SERIES_COUNT, numberedSeries } from '@sa/core';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/inputs';
import { cn } from '../../lib/cn';
import { formatDue, isoFromLocal } from '../../lib/dates';
import type { CourseAction } from './actions';
import { seriesToInputs } from './bulk';
import { CategorySelect } from './CategorySelect';

interface SeriesPanelProps {
  detail: CourseDetail;
  act: CourseAction;
  defaultCategoryId: string | null;
  onClose: () => void;
}

const NUMBER = /^\d+(?:\.\d+)?$/;

/** Bulk add "Video Quiz 1" … "Video Quiz 8", due every N days from the first due date. */
export function SeriesPanel({ detail, act, defaultCategoryId, onClose }: SeriesPanelProps) {
  const { course, categories } = detail;
  const [form, setForm] = useState({
    name: '',
    count: '',
    points: '',
    categoryId: defaultCategoryId,
    firstDue: '',
    everyDays: '7',
  });
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const categoryId = useId();
  useEffect(() => nameRef.current?.focus(), []);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const count = Number(form.count);
  const everyDays = Number(form.everyDays);
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(form.firstDue);
  const valid =
    form.name.trim() !== '' &&
    Number.isInteger(count) &&
    count >= 1 &&
    count <= MAX_SERIES_COUNT &&
    NUMBER.test(form.points.trim()) &&
    (!dateMatch || (Number.isInteger(everyDays) && everyDays >= 0));
  const items = valid
    ? numberedSeries({
        name: form.name,
        count,
        everyDays: dateMatch ? everyDays : 0,
        firstDue: dateMatch
          ? { year: Number(dateMatch[1]), month: Number(dateMatch[2]), day: Number(dateMatch[3]) }
          : null,
      })
    : [];
  const first = items[0];
  const last = items.at(-1);
  const dueText = (item: (typeof items)[number] | undefined) =>
    item?.due ? ` (${formatDue(isoFromLocal(item.due))})` : '';

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    const ok = await act(() =>
      window.api.invoke(
        'assignment:create-many',
        seriesToInputs(items, {
          courseId: course.id,
          categoryId: form.categoryId,
          pointsPossible: Number(form.points),
        }),
      ),
    );
    setBusy(false);
    if (ok) onClose();
  }

  const field = 'grid gap-1 text-sm';
  const label = 'text-zinc-600 dark:text-zinc-400';
  return (
    <form
      onSubmit={(e) => void save(e)}
      className="mt-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h3 className="text-sm font-semibold">Add a numbered series</h3>
      <p className="mt-1 text-xs text-zinc-500">
        For example 8 video quizzes of 10 points, one due every week. The due date is optional.
      </p>
      <div className="mt-3 grid grid-cols-[1fr_6rem_6rem_12rem] gap-3">
        <label className={field}>
          <span className={label}>Name</span>
          <input
            ref={nameRef}
            className={inputClass}
            placeholder="Video Quiz"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <label className={field}>
          <span className={label}>How many</span>
          <input
            className={inputClass}
            inputMode="numeric"
            value={form.count}
            onChange={(e) => set({ count: e.target.value })}
          />
        </label>
        <label className={field}>
          <span className={label}>Points each</span>
          <input
            className={inputClass}
            inputMode="decimal"
            value={form.points}
            onChange={(e) => set({ points: e.target.value })}
          />
        </label>
        <label htmlFor={categoryId} className={field}>
          <span className={label}>Category</span>
          <CategorySelect
            id={categoryId}
            className={inputClass}
            categories={categories}
            value={form.categoryId}
            onChange={(categoryId) => set({ categoryId })}
          />
        </label>
      </div>
      <div className="mt-3 flex items-end gap-3">
        <label className={field}>
          <span className={label}>First due</span>
          <input
            type="date"
            className={inputClass}
            value={form.firstDue}
            onChange={(e) => set({ firstDue: e.target.value })}
          />
        </label>
        <label className={cn(field, !dateMatch && 'opacity-50')}>
          <span className={label}>Then every … days</span>
          <input
            className={cn(inputClass, 'w-24')}
            inputMode="numeric"
            disabled={!dateMatch}
            value={form.everyDays}
            onChange={(e) => set({ everyDays: e.target.value })}
          />
        </label>
      </div>
      {first && last && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          {first.title}
          {dueText(first)}
          {items.length > 1 && ` … ${last.title}${dueText(last)}`}
        </p>
      )}
      <div className="mt-4 flex gap-3">
        <Button type="submit" variant="primary" disabled={busy || !valid}>
          Add {items.length || ''} assignment{items.length === 1 ? '' : 's'}
        </Button>
        <Button onClick={onClose}>Cancel</Button>
      </div>
    </form>
  );
}
