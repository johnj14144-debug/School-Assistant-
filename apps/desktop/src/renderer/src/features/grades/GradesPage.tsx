import type { CourseSummary } from '@sa/core';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { useIpcQuery } from '../../lib/useIpc';
import { CourseCard } from './CourseCard';

/** Courses grouped by term, newest term first (by when its latest course was added). */
function byTerm(courses: CourseSummary[]): [string, CourseSummary[]][] {
  const groups = new Map<string, CourseSummary[]>();
  for (const course of courses) {
    const term = course.term || 'No term';
    groups.set(term, [...(groups.get(term) ?? []), course]);
  }
  const newest = (list: CourseSummary[]) =>
    list.reduce((m, c) => (c.createdAt > m ? c.createdAt : m), '');
  return [...groups.entries()].sort((a, b) => newest(b[1]).localeCompare(newest(a[1])));
}

export function GradesPage() {
  const navigate = useNavigate();
  const { data: courses, error } = useIpcQuery('course:list');

  return (
    <div className="mx-auto max-w-5xl px-10 py-12">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Grades</h1>
          <p className="mt-1 text-zinc-600 dark:text-zinc-400">
            Your current grade in every course, and the best and worst still possible.
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate('/grades/new')}>
          <Plus className="-ml-1 mr-1 inline size-4" aria-hidden />
          Add course
        </Button>
      </div>

      {error && <p className="mt-6 text-sm text-red-700">{error}</p>}

      {courses?.length === 0 && (
        <div className="mt-10 rounded-xl border border-dashed border-zinc-300 p-10 text-center dark:border-zinc-700">
          <p className="font-medium">No courses yet</p>
          <p className="mt-1 text-sm text-zinc-500">
            Add a course from its syllabus: grading categories first, then the assignments.
          </p>
          <Button variant="primary" className="mt-4" onClick={() => navigate('/grades/new')}>
            Add your first course
          </Button>
        </div>
      )}

      {courses &&
        byTerm(courses).map(([term, list]) => (
          <section key={term} className="mt-10">
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
              {term}
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4">
              {list.map((course) => (
                <CourseCard key={course.id} course={course} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
