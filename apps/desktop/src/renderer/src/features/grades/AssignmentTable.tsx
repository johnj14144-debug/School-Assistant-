import type { Assignment, CourseDetail } from '@sa/core';
import { type FormEvent, useId, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { DateCell } from '../../components/DateCell';
import { EditableCell } from '../../components/EditableCell';
import { cellInputClass, inputClass } from '../../components/inputs';
import { cn } from '../../lib/cn';
import { fromDateInput } from '../../lib/dates';
import { formatPercent } from '../../lib/format';
import type { CourseAction } from './actions';
import { CategorySelect } from './CategorySelect';
import { numberText, parseAmount, parseScore } from './cells';

interface AssignmentTableProps {
  detail: CourseDetail;
  act: CourseAction;
  /** 'all', 'none' (no category) or a category id. */
  filter: string;
}

interface AddDraft {
  title: string;
  categoryId: string | null;
  due: string;
  earned: string;
  possible: string;
  extraCredit: boolean;
}

type Patch = Partial<Omit<Assignment, 'id' | 'courseId' | 'createdAt' | 'updatedAt'>>;

function scorePercent(a: Assignment): string {
  if (a.pointsEarned === null) return '';
  if (a.extraCredit || a.pointsPossible <= 0) return `+${numberText(a.pointsEarned)}`;
  return formatPercent((a.pointsEarned * 100) / a.pointsPossible);
}

/**
 * Assignments edited in place. Typing a score and pressing Enter moves to the next row's score,
 * so a column of grades goes in quickly. The add row keeps the category and points for the next
 * assignment.
 */
export function AssignmentTable({ detail, act, filter }: AssignmentTableProps) {
  const { course, categories, assignments, grade } = detail;
  const formId = useId();
  const titleRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const filterCategory = filter === 'all' || filter === 'none' ? null : filter;
  const [draft, setDraft] = useState<AddDraft>({
    title: '',
    categoryId: filterCategory,
    due: '',
    earned: '',
    possible: '',
    extraCredit: false,
  });
  // A new filter becomes the add row's category.
  const [lastFilter, setLastFilter] = useState(filter);
  if (filter !== lastFilter) {
    setLastFilter(filter);
    if (filterCategory) setDraft((d) => ({ ...d, categoryId: filterCategory }));
  }

  const dropped = new Set(grade.dropped);
  const rows = assignments.filter((a) =>
    filter === 'all' ? true : filter === 'none' ? a.categoryId === null : a.categoryId === filter,
  );

  /** `patch` runs inside the action, so a parse error shows up like a save error. */
  const update = (id: string, patch: () => Patch) =>
    act(() => window.api.invoke('assignment:update', { id, ...patch() }));

  function focusScore(index: number) {
    const next = rows[index];
    const target = next
      ? tableRef.current?.querySelector<HTMLInputElement>(`[data-score="${next.id}"]`)
      : titleRef.current;
    target?.focus();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const ok = await act(() => {
      const score = parseScore(draft.earned);
      return window.api.invoke('assignment:create', {
        courseId: course.id,
        title: draft.title,
        categoryId: draft.categoryId,
        dueAt: fromDateInput(draft.due),
        pointsPossible: score.pointsPossible ?? parseAmount(draft.possible, 'Points possible'),
        pointsEarned: score.pointsEarned,
        extraCredit: draft.extraCredit,
      });
    });
    if (ok) {
      setDraft({ ...draft, title: '', due: '', earned: '', extraCredit: false });
      titleRef.current?.focus();
    }
  }

  async function remove(a: Assignment) {
    if (!window.confirm(`Delete "${a.title}"?`)) return;
    await act(() => window.api.invoke('assignment:delete', { id: a.id }));
  }

  const canAdd =
    draft.title.trim() !== '' && (draft.possible.trim() !== '' || draft.earned.includes('/'));

  return (
    <>
      <table ref={tableRef} className="mt-3 w-full table-fixed text-sm">
        <thead className="text-left text-xs text-zinc-500">
          <tr>
            <th className="px-1.5 py-1 font-medium">Title</th>
            <th className="w-48 px-1.5 py-1 font-medium">Category</th>
            <th className="w-36 px-1.5 py-1 font-medium">Due</th>
            <th className="w-40 px-1.5 py-1 font-medium">Score</th>
            <th className="w-28 px-1.5 py-1 font-medium">%</th>
            <th className="w-10 px-1.5 py-1 font-medium" title="Extra credit">
              EC
            </th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-1.5 py-3 text-zinc-500">
                {assignments.length === 0
                  ? 'No assignments yet. Add them below, paste a list, or add a numbered series.'
                  : 'No assignments in this category.'}
              </td>
            </tr>
          )}
          {rows.map((a, index) => (
            <tr key={a.id} className={cn(dropped.has(a.id) && 'text-zinc-400')}>
              <td className="py-0.5">
                <EditableCell
                  aria-label="Title"
                  value={a.title}
                  onCommit={(title) => update(a.id, () => ({ title }))}
                />
              </td>
              <td className="py-0.5">
                <CategorySelect
                  aria-label="Category"
                  className={cellInputClass}
                  categories={categories}
                  value={a.categoryId}
                  onChange={(categoryId) => void update(a.id, () => ({ categoryId }))}
                />
              </td>
              <td className="py-0.5">
                <DateCell
                  aria-label="Due date"
                  value={a.dueAt}
                  onCommit={(dueAt) => update(a.id, () => ({ dueAt }))}
                />
              </td>
              <td className="py-0.5">
                <div className="flex items-center">
                  <EditableCell
                    aria-label="Points earned"
                    data-score={a.id}
                    inputMode="decimal"
                    placeholder="—"
                    className="text-right tabular-nums"
                    value={numberText(a.pointsEarned)}
                    onCommit={(v) => update(a.id, () => parseScore(v))}
                    onEnter={() => focusScore(index + 1)}
                  />
                  <span className="px-0.5 text-zinc-400">/</span>
                  <EditableCell
                    aria-label="Points possible"
                    inputMode="decimal"
                    className="tabular-nums"
                    value={numberText(a.pointsPossible)}
                    onCommit={(v) =>
                      update(a.id, () => ({ pointsPossible: parseAmount(v, 'Points possible') }))
                    }
                  />
                </div>
              </td>
              <td className="px-1.5 py-0.5 tabular-nums">
                {scorePercent(a)}
                {dropped.has(a.id) && (
                  <span
                    className="ml-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-500 dark:bg-zinc-800"
                    title="Dropped by the category's drop-lowest rule"
                  >
                    dropped
                  </span>
                )}
              </td>
              <td className="px-1.5 py-0.5">
                <input
                  type="checkbox"
                  aria-label="Extra credit"
                  checked={a.extraCredit}
                  onChange={(e) => {
                    const extraCredit = e.target.checked;
                    void update(a.id, () => ({ extraCredit }));
                  }}
                />
              </td>
              <td className="py-0.5 text-right">
                <button
                  type="button"
                  aria-label={`Delete ${a.title}`}
                  className="rounded px-2 py-1 text-zinc-400 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                  onClick={() => void remove(a)}
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-200 dark:border-zinc-800">
            <td className="pt-2 pr-1.5">
              <input
                ref={titleRef}
                form={formId}
                aria-label="New assignment title"
                className={cn(inputClass, 'w-full')}
                placeholder="Add an assignment"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </td>
            <td className="pt-2 pr-1.5">
              <CategorySelect
                form={formId}
                aria-label="New assignment category"
                className={cn(inputClass, 'w-full')}
                categories={categories}
                value={draft.categoryId}
                onChange={(categoryId) => setDraft({ ...draft, categoryId })}
              />
            </td>
            <td className="pt-2 pr-1.5">
              <input
                type="date"
                form={formId}
                aria-label="New assignment due date"
                className={cn(inputClass, 'w-full')}
                value={draft.due}
                onChange={(e) => setDraft({ ...draft, due: e.target.value })}
              />
            </td>
            <td className="pt-2 pr-1.5">
              <div className="flex items-center gap-1">
                <input
                  form={formId}
                  aria-label="New assignment points earned"
                  inputMode="decimal"
                  className={cn(inputClass, 'w-full min-w-0 text-right')}
                  placeholder="earned"
                  value={draft.earned}
                  onChange={(e) => setDraft({ ...draft, earned: e.target.value })}
                />
                <span className="text-zinc-400">/</span>
                <input
                  form={formId}
                  aria-label="New assignment points possible"
                  inputMode="decimal"
                  className={cn(inputClass, 'w-full min-w-0')}
                  placeholder="pts"
                  value={draft.possible}
                  onChange={(e) => setDraft({ ...draft, possible: e.target.value })}
                />
              </div>
            </td>
            <td className="pt-2 px-1.5">
              <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                <input
                  type="checkbox"
                  form={formId}
                  checked={draft.extraCredit}
                  onChange={(e) => setDraft({ ...draft, extraCredit: e.target.checked })}
                />
                extra credit
              </label>
            </td>
            <td className="pt-2 text-right" colSpan={2}>
              <Button type="submit" form={formId} disabled={!canAdd}>
                Add
              </Button>
            </td>
          </tr>
        </tfoot>
      </table>
      <form id={formId} onSubmit={(e) => void add(e)} />
    </>
  );
}
