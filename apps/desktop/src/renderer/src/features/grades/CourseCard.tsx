import type { CourseSummary } from '@sa/core';
import { Link } from 'react-router';
import { formatPercent } from '../../lib/format';
import { gradeText, letterText } from './gradeText';
import { WarningList } from './WarningList';

/** Overview card: current grade big, best and worst still possible below. */
export function CourseCard({ course }: { course: CourseSummary }) {
  const { grade, letterScale } = course;
  return (
    <Link
      to={`/grades/${course.id}`}
      className="group block overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="h-1.5" style={{ backgroundColor: course.color }} />
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-semibold group-hover:text-indigo-700 dark:group-hover:text-indigo-300">
              {course.name}
            </h3>
            <p className="truncate text-sm text-zinc-500">
              {[course.code, course.kind === 'self_study' ? 'self-study' : null]
                .filter(Boolean)
                .join(' · ') || ' '}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">
              {letterText(grade.current, letterScale)}
            </div>
            <div className="text-sm tabular-nums text-zinc-500">{formatPercent(grade.current)}</div>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-xs text-zinc-500">Best still possible</dt>
            <dd className="tabular-nums">{gradeText(grade.max, letterScale)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">Worst still possible</dt>
            <dd className="tabular-nums">{gradeText(grade.min, letterScale)}</dd>
          </div>
        </dl>
        {course.assignmentCount === 0 && (
          <p className="mt-3 text-xs text-zinc-500">No assignments yet</p>
        )}
        <WarningList warnings={grade.warnings} className="mt-3" />
      </div>
    </Link>
  );
}
