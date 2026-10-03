import type { CategoryKind, CourseDetail, GradeCategory } from '@sa/core';
import { type FormEvent, useId, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { EditableCell } from '../../components/EditableCell';
import { cellInputClass, inputClass } from '../../components/inputs';
import { cn } from '../../lib/cn';
import { formatPercent } from '../../lib/format';
import type { CourseAction } from './actions';
import { numberText, parseAmount, parseWholeNumber } from './cells';

interface CategoryTableProps {
  detail: CourseDetail;
  act: CourseAction;
}

const KIND_LABELS: Record<CategoryKind, string> = {
  regular: 'Part of the grade',
  bonus: 'Bonus on final grade',
};

const emptyDraft = { name: '', kind: 'regular' as CategoryKind, weight: '', dropLowest: '' };

/**
 * The course's grading categories, edited in place. Weighted courses show the weight total (it
 * should be 100%). A bonus category's "weight" is its cap in percentage points.
 */
export function CategoryTable({ detail, act }: CategoryTableProps) {
  const { course, categories, assignments, grade } = detail;
  const weighted = course.grading === 'weighted';
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const gradeOf = new Map(grade.categories.map((g) => [g.categoryId, g]));
  const regular = categories.filter((c) => c.kind === 'regular');
  const total = regular.reduce((sum, c) => sum + c.weight, 0);

  /** `patch` runs inside the action, so a parse error shows up like a save error. */
  const update = (id: string, patch: () => Partial<Omit<GradeCategory, 'id' | 'courseId'>>) =>
    act(() => window.api.invoke('category:update', { id, ...patch() }));

  async function add(e: FormEvent) {
    e.preventDefault();
    const usesWeight = weighted || draft.kind === 'bonus';
    const ok = await act(() =>
      window.api.invoke('category:create', {
        courseId: course.id,
        name: draft.name,
        kind: draft.kind,
        weight: usesWeight && draft.weight.trim() !== '' ? parseAmount(draft.weight, 'Weight') : 0,
        dropLowest:
          draft.kind === 'regular' ? parseWholeNumber(draft.dropLowest, 'Drop lowest') : 0,
      }),
    );
    if (ok) {
      setDraft(emptyDraft);
      nameRef.current?.focus();
    }
  }

  async function remove(category: GradeCategory) {
    const count = assignments.filter((a) => a.categoryId === category.id).length;
    const message =
      count === 0
        ? `Delete the category "${category.name}"?`
        : `Delete the category "${category.name}"? Its ${count} assignment${count === 1 ? '' : 's'} stay, without a category.`;
    if (!window.confirm(message)) return;
    await act(() => window.api.invoke('category:delete', { id: category.id }));
  }

  return (
    <>
      <table className="mt-3 w-full table-fixed text-sm">
        <thead className="text-left text-xs text-zinc-500">
          <tr>
            <th className="px-1.5 py-1 font-medium">Name</th>
            <th className="w-44 px-1.5 py-1 font-medium">Counts as</th>
            <th className="w-28 px-1.5 py-1 font-medium">{weighted ? 'Weight' : 'Cap'}</th>
            <th className="w-24 px-1.5 py-1 font-medium">Drop lowest</th>
            <th className="w-32 px-1.5 py-1 font-medium">Grade so far</th>
            <th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {categories.map((c) => {
            const g = gradeOf.get(c.id);
            const bonus = c.kind === 'bonus';
            return (
              <tr key={c.id}>
                <td className="py-0.5">
                  <EditableCell
                    aria-label="Category name"
                    value={c.name}
                    onCommit={(name) => update(c.id, () => ({ name }))}
                  />
                </td>
                <td className="py-0.5">
                  <select
                    aria-label="Counts as"
                    className={cellInputClass}
                    value={c.kind}
                    onChange={(e) => {
                      const kind = e.target.value as CategoryKind;
                      void update(c.id, () => ({ kind }));
                    }}
                  >
                    {Object.entries(KIND_LABELS).map(([kind, label]) => (
                      <option key={kind} value={kind}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-0.5">
                  {weighted || bonus ? (
                    <div className="flex items-center">
                      <EditableCell
                        aria-label={bonus ? 'Bonus cap' : 'Weight'}
                        className="text-right tabular-nums"
                        value={numberText(c.weight)}
                        onCommit={(v) => update(c.id, () => ({ weight: parseAmount(v, 'Weight') }))}
                      />
                      <span className="w-10 shrink-0 pl-1 text-xs text-zinc-500">
                        {bonus ? 'pts' : '%'}
                      </span>
                    </div>
                  ) : (
                    <span className="px-1.5 text-zinc-400" title="Points courses don't use weights">
                      —
                    </span>
                  )}
                </td>
                <td className="py-0.5">
                  {bonus ? (
                    <span className="px-1.5 text-zinc-400">—</span>
                  ) : (
                    <EditableCell
                      aria-label="Drop lowest"
                      className="text-right tabular-nums"
                      value={String(c.dropLowest)}
                      onCommit={(v) =>
                        update(c.id, () => ({ dropLowest: parseWholeNumber(v, 'Drop lowest') }))
                      }
                    />
                  )}
                </td>
                <td className="px-1.5 py-0.5 tabular-nums">
                  {!g
                    ? '—'
                    : bonus
                      ? `+${numberText(g.current ?? 0)} of ${numberText(c.weight)}`
                      : formatPercent(g.current)}
                </td>
                <td className="py-0.5 text-right">
                  <button
                    type="button"
                    aria-label={`Delete ${c.name}`}
                    className="rounded px-2 py-1 text-zinc-400 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                    onClick={() => void remove(c)}
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-200 dark:border-zinc-800">
            <td className="pt-2 pr-1.5">
              <input
                ref={nameRef}
                form={formId}
                aria-label="New category name"
                className={cn(inputClass, 'w-full')}
                placeholder={
                  categories.length === 0 ? 'Add a category, e.g. Homework' : 'Add a category'
                }
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </td>
            <td className="pt-2 pr-1.5">
              <select
                form={formId}
                aria-label="New category counts as"
                className={cn(inputClass, 'w-full')}
                value={draft.kind}
                onChange={(e) => setDraft({ ...draft, kind: e.target.value as CategoryKind })}
              >
                {Object.entries(KIND_LABELS).map(([kind, label]) => (
                  <option key={kind} value={kind}>
                    {label}
                  </option>
                ))}
              </select>
            </td>
            <td className="pt-2 pr-1.5">
              {(weighted || draft.kind === 'bonus') && (
                <input
                  form={formId}
                  aria-label="New category weight"
                  inputMode="decimal"
                  className={cn(inputClass, 'w-full text-right')}
                  placeholder={draft.kind === 'bonus' ? 'pts' : '%'}
                  value={draft.weight}
                  onChange={(e) => setDraft({ ...draft, weight: e.target.value })}
                />
              )}
            </td>
            <td className="pt-2 pr-1.5">
              {draft.kind === 'regular' && (
                <input
                  form={formId}
                  aria-label="New category drop lowest"
                  inputMode="numeric"
                  className={cn(inputClass, 'w-full text-right')}
                  placeholder="0"
                  value={draft.dropLowest}
                  onChange={(e) => setDraft({ ...draft, dropLowest: e.target.value })}
                />
              )}
            </td>
            <td className="pt-2" colSpan={2}>
              <Button type="submit" form={formId} disabled={draft.name.trim() === ''}>
                Add
              </Button>
            </td>
          </tr>
        </tfoot>
      </table>
      <form id={formId} onSubmit={(e) => void add(e)} />
      {weighted && regular.length > 0 && (
        <p
          className={cn(
            'mt-2 text-xs',
            Math.abs(total - 100) < 1e-6
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-amber-700 dark:text-amber-400',
          )}
        >
          {Math.abs(total - 100) < 1e-6
            ? '✓ Weights add up to 100%'
            : `Weights add up to ${formatPercent(total)}; they should add up to 100%`}
        </p>
      )}
    </>
  );
}
