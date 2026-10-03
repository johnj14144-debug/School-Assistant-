import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/inputs';
import { errorMessage } from '../../lib/format';
import { useIpcQuery } from '../../lib/useIpc';
import { AssignmentTable } from './AssignmentTable';
import type { CourseAction } from './actions';
import { CategoryTable } from './CategoryTable';
import { CourseForm } from './CourseForm';
import { gradeText } from './gradeText';
import { PasteListPanel } from './PasteListPanel';
import { SeriesPanel } from './SeriesPanel';
import { WarningList } from './WarningList';

/**
 * One course: grade summary, course settings, and its categories and assignments edited in
 * place, plus bulk add (paste a list, numbered series).
 */
export function CoursePage() {
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, reload } = useIpcQuery('course:get', { id: courseId }, courseId);
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [filter, setFilter] = useState('all');
  const [panel, setPanel] = useState<'paste' | 'series' | null>(null);

  const act: CourseAction = useCallback(
    async (change) => {
      try {
        await change();
        setActionError(null);
        await reload();
        return true;
      } catch (e) {
        setActionError(errorMessage(e));
        return false;
      }
    },
    [reload],
  );

  if (error) return <p className="p-10 text-sm text-red-700">{error}</p>;
  if (!data) return null;
  const { course, categories, assignments, grade } = data;
  const uncategorized = assignments.filter((a) => a.categoryId === null).length;
  // A filter on a deleted category falls back to all.
  const activeFilter =
    filter === 'all' || filter === 'none' || categories.some((c) => c.id === filter)
      ? filter
      : 'all';
  const filterCategory = activeFilter === 'all' || activeFilter === 'none' ? null : activeFilter;

  async function remove() {
    if (!window.confirm(`Delete ${course.name} with all its categories and assignments?`)) return;
    try {
      await window.api.invoke('course:delete', { id: course.id });
      navigate('/grades');
    } catch (e) {
      setActionError(errorMessage(e));
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-10 py-12">
      <Link
        to="/grades"
        className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        ← Grades
      </Link>
      <div className="mt-2 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
            <span className="size-3 rounded-full" style={{ backgroundColor: course.color }} />
            {course.name}
          </h1>
          <p className="mt-1 text-zinc-500">
            {[course.code, course.term, course.grading === 'weighted' ? 'weighted' : 'total points']
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setEditing(!editing)}>{editing ? 'Close' : 'Edit course'}</Button>
          <Button variant="danger" onClick={() => void remove()}>
            Delete
          </Button>
        </div>
      </div>

      {editing && (
        <div className="mt-6 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <CourseForm
            course={course}
            submitLabel="Save"
            onCancel={() => setEditing(false)}
            onSubmit={async (values) => {
              try {
                await window.api.invoke('course:update', { id: course.id, ...values });
                setEditing(false);
                reload();
              } catch (e) {
                setActionError(errorMessage(e));
              }
            }}
          />
        </div>
      )}

      <dl className="mt-8 grid grid-cols-3 gap-4">
        {(
          [
            ['Current grade', grade.current],
            ['Best still possible', grade.max],
            ['Worst still possible', grade.min],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <dt className="text-xs text-zinc-500">{label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">
              {gradeText(value, course.letterScale)}
            </dd>
          </div>
        ))}
      </dl>
      <WarningList warnings={grade.warnings} className="mt-3" />

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Grading categories</h2>
        {categories.length === 0 && (
          <p className="mt-1 text-sm text-zinc-500">
            {course.grading === 'weighted'
              ? 'Copy them from the grading section of the syllabus, e.g. Homework 20%.'
              : 'Optional for a points course: all points count the same either way.'}
          </p>
        )}
        <CategoryTable detail={data} act={act} />
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Assignments</h2>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              Show
              <select
                className={inputClass}
                value={activeFilter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All ({assignments.length})</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({assignments.filter((a) => a.categoryId === c.id).length})
                  </option>
                ))}
                {uncategorized > 0 && <option value="none">No category ({uncategorized})</option>}
              </select>
            </label>
            <Button onClick={() => setPanel(panel === 'paste' ? null : 'paste')}>
              Paste a list
            </Button>
            <Button onClick={() => setPanel(panel === 'series' ? null : 'series')}>
              Add a series
            </Button>
          </div>
        </div>
        {panel === 'paste' && (
          <PasteListPanel
            detail={data}
            act={act}
            defaultCategoryId={filterCategory}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === 'series' && (
          <SeriesPanel
            detail={data}
            act={act}
            defaultCategoryId={filterCategory}
            onClose={() => setPanel(null)}
          />
        )}
        <AssignmentTable detail={data} act={act} filter={activeFilter} />
      </section>

      {actionError && (
        <div
          role="alert"
          className="fixed bottom-4 left-1/2 flex max-w-lg -translate-x-1/2 items-start gap-3 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-700 shadow-lg dark:border-red-900 dark:bg-zinc-900 dark:text-red-400"
        >
          <span>{actionError}</span>
          <button
            type="button"
            aria-label="Dismiss"
            className="text-zinc-400 hover:text-zinc-700"
            onClick={() => setActionError(null)}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
