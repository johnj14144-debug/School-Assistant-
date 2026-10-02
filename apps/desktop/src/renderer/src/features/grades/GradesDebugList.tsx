import { letterFor } from '@sa/core';
import { useCallback, useEffect, useState } from 'react';
import type { IpcOutput } from '../../../../shared/ipc';
import { Button } from '../../components/Button';
import { errorMessage, formatPercent } from '../../lib/format';
import { addSampleCourse } from './sampleCourse';

type CourseSummary = IpcOutput<'course:list'>[number];

function withLetter(value: number | null, course: CourseSummary): string {
  return value === null ? '—' : `${formatPercent(value)} (${letterFor(value, course.letterScale)})`;
}

/** Temporary list proving the database and grade math work end to end; M2 replaces it. */
export function GradesDebugList() {
  const [courses, setCourses] = useState<CourseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    window.api
      .invoke('course:list')
      .then(setCourses)
      .catch((e: unknown) => setError(errorMessage(e)));
  }, []);

  useEffect(() => refresh(), [refresh]);

  async function act(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    }
    refresh();
  }

  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Courses in the database</h2>
        <Button onClick={() => void act(addSampleCourse)}>Add sample course</Button>
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        A temporary debug view. Entering courses arrives with the Grade Calc screens in M2.
      </p>
      {error && (
        <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}
      {courses?.length === 0 && <p className="mt-4 text-sm text-zinc-500">No courses yet.</p>}
      {courses && courses.length > 0 && (
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-xs uppercase text-zinc-500">
            <tr>
              <th className="py-2 font-medium">Course</th>
              <th className="py-2 font-medium">Items</th>
              <th className="py-2 font-medium">Current</th>
              <th className="py-2 font-medium">Max</th>
              <th className="py-2 font-medium">Min</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {courses.map((course) => (
              <tr key={course.id}>
                <td className="py-2">
                  <span
                    className="mr-2 inline-block size-2.5 rounded-full"
                    style={{ backgroundColor: course.color }}
                  />
                  {course.name}
                  <span className="ml-2 text-zinc-500">
                    {[course.code, course.term, course.grading].filter(Boolean).join(' · ')}
                  </span>
                  {course.grade.warnings.map((w) => (
                    <span key={w.code} className="ml-2 text-xs text-amber-600">
                      {w.code === 'weights_not_100'
                        ? `weights sum to ${w.total}%`
                        : `${w.count} uncategorized ignored`}
                    </span>
                  ))}
                </td>
                <td className="py-2 text-zinc-500">
                  {course.categoryCount} categories, {course.assignmentCount} assignments
                </td>
                <td className="py-2">{withLetter(course.grade.current, course)}</td>
                <td className="py-2">{withLetter(course.grade.max, course)}</td>
                <td className="py-2">{withLetter(course.grade.min, course)}</td>
                <td className="py-2 text-right">
                  <Button
                    variant="danger"
                    onClick={() =>
                      void act(() => window.api.invoke('course:delete', { id: course.id }))
                    }
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
