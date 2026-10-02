import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/Button';
import { formatDue } from '../../lib/dates';
import { errorMessage, formatPercent } from '../../lib/format';
import { useIpcQuery } from '../../lib/useIpc';
import { CourseForm } from './CourseForm';
import { gradeText } from './gradeText';
import { WarningList } from './WarningList';

/**
 * One course: grade summary, edit and delete. Work in progress (M2): editing categories and
 * assignments here comes next; for now they are listed read-only.
 */
export function CoursePage() {
  const { courseId = '' } = useParams();
  const navigate = useNavigate();
  const { data, error, reload } = useIpcQuery('course:get', { id: courseId }, courseId);
  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <p className="p-10 text-sm text-red-700">{error}</p>;
  if (!data) return null;
  const { course, categories, assignments, grade } = data;
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

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
      {actionError && <p className="mt-4 text-sm text-red-700">{actionError}</p>}

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
        {categories.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">None yet.</p>
        ) : (
          <ul className="mt-2 grid gap-1 text-sm">
            {categories.map((c) => (
              <li key={c.id}>
                {c.name} —{' '}
                {c.kind === 'bonus'
                  ? `up to ${c.weight} bonus points`
                  : `${formatPercent(c.weight)}`}
                {c.dropLowest > 0 && `, lowest ${c.dropLowest} dropped`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Assignments</h2>
        {assignments.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">None yet.</p>
        ) : (
          <ul className="mt-2 grid gap-1 text-sm">
            {assignments.map((a) => (
              <li key={a.id}>
                {a.title}
                <span className="text-zinc-500">
                  {' '}
                  · {a.categoryId ? categoryName.get(a.categoryId) : 'no category'} ·{' '}
                  {a.pointsEarned ?? '—'}/{a.pointsPossible}
                  {a.dueAt && ` · due ${formatDue(a.dueAt)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
