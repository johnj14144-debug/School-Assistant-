import { type CourseDetail, parseAssignmentLines } from '@sa/core';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/inputs';
import { cn } from '../../lib/cn';
import { formatDue, isoFromLocal, todayLocal } from '../../lib/dates';
import type { CourseAction } from './actions';
import { pastedToInputs } from './bulk';
import { CategorySelect } from './CategorySelect';
import { numberText } from './cells';

const MAX_LINES = 200;

interface PasteListPanelProps {
  detail: CourseDetail;
  act: CourseAction;
  defaultCategoryId: string | null;
  onClose: () => void;
}

/** Bulk add from pasted lines ("HW 1, 10/7, 20 pts"), with a preview and per-line errors. */
export function PasteListPanel({ detail, act, defaultCategoryId, onClose }: PasteListPanelProps) {
  const { course, categories } = detail;
  const [text, setText] = useState('');
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [busy, setBusy] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const selectId = useId();
  useEffect(() => textRef.current?.focus(), []);

  const lines = useMemo(
    () =>
      parseAssignmentLines(text, {
        today: todayLocal(),
        categoryNames: categories.map((c) => c.name),
      }),
    [text, categories],
  );
  const problems = lines.filter((l) => l.errors.length > 0).length;
  const tooMany = lines.length > MAX_LINES;
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const fallbackName = categoryId ? categoryName.get(categoryId) : undefined;

  async function save() {
    setBusy(true);
    const ok = await act(() =>
      window.api.invoke(
        'assignment:create-many',
        pastedToInputs(lines, { courseId: course.id, categories, defaultCategoryId: categoryId }),
      ),
    );
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold">Paste a list</h3>
      <p className="mt-1 text-xs text-zinc-500">
        One assignment per line, fields separated by commas, semicolons or tabs (rows copied from a
        spreadsheet work). After the title, in any order: a due date (10/7, Oct 7 2pm), the points
        (20 pts, or 18/20 pts if it's graded), a category name, or EC for extra credit.
      </p>
      <textarea
        ref={textRef}
        aria-label="Assignments to add, one per line"
        className={cn(inputClass, 'mt-3 h-36 w-full font-mono')}
        placeholder={
          'HW 1, 9/7, 20 pts\nQuiz 2; Oct 14 2pm; 8/10 pts; Quizzes\nPresentation, 5 pts, EC'
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <label htmlFor={selectId} className="mt-2 flex items-center gap-2 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">
          Category for lines that don't name one
        </span>
        <CategorySelect
          id={selectId}
          className={inputClass}
          categories={categories}
          value={categoryId}
          onChange={setCategoryId}
        />
      </label>

      {lines.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="w-10 py-1 font-medium">Line</th>
              <th className="py-1 font-medium">Title</th>
              <th className="py-1 font-medium">Category</th>
              <th className="py-1 font-medium">Due</th>
              <th className="py-1 font-medium">Points</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {lines.map((line) => (
              <tr
                key={line.line}
                className={cn(line.errors.length > 0 && 'text-red-700 dark:text-red-400')}
              >
                <td className="py-1 tabular-nums text-zinc-400">{line.line}</td>
                {line.errors.length > 0 ? (
                  <td className="py-1" colSpan={4}>
                    {line.title && <span className="font-medium">{line.title}: </span>}
                    {line.errors.join('; ')}
                  </td>
                ) : (
                  <>
                    <td className="py-1">
                      {line.title}
                      {line.extraCredit && <span className="ml-1.5 text-xs text-zinc-500">EC</span>}
                    </td>
                    <td className="py-1 text-zinc-600 dark:text-zinc-400">
                      {line.categoryName ?? fallbackName ?? '—'}
                    </td>
                    <td className="py-1 text-zinc-600 dark:text-zinc-400">
                      {line.due ? formatDue(isoFromLocal(line.due)) : '—'}
                    </td>
                    <td className="py-1 tabular-nums">
                      {line.pointsEarned !== null && `${numberText(line.pointsEarned)} / `}
                      {numberText(line.pointsPossible)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button
          variant="primary"
          disabled={busy || lines.length === 0 || problems > 0 || tooMany}
          onClick={() => void save()}
        >
          Add {lines.length || ''} assignment{lines.length === 1 ? '' : 's'}
        </Button>
        <Button onClick={onClose}>Cancel</Button>
        {problems > 0 && (
          <span className="text-xs text-red-700 dark:text-red-400">
            Fix or remove the {problems === 1 ? 'line' : `${problems} lines`} marked in red.
          </span>
        )}
        {tooMany && (
          <span className="text-xs text-red-700 dark:text-red-400">
            At most {MAX_LINES} at a time.
          </span>
        )}
      </div>
    </div>
  );
}
