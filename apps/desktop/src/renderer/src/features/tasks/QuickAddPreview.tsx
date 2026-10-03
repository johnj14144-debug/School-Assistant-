import { formatMinutes, type QuickAdd, type QuickAddCourse } from '@sa/core';
import { cn } from '../../lib/cn';
import { formatTaskDue, isoFromLocal } from '../../lib/dates';
import { quantityText } from './format';

const chip = 'rounded-full px-2 py-0.5 text-xs';

/** What a quick-add line will create: due, estimate, course, type, priority, and warnings. */
export function QuickAddPreview({
  parsed,
  courses,
  className,
}: {
  parsed: QuickAdd;
  courses: readonly (QuickAddCourse & { color?: string })[];
  className?: string;
}) {
  const course = courses.find((c) => c.id === parsed.courseId);
  const chips = [
    parsed.due && `Due ${formatTaskDue(isoFromLocal(parsed.due))}`,
    parsed.estimateMin !== null && `~${formatMinutes(parsed.estimateMin)}`,
    course && (course.code || course.name),
    parsed.type && `@${parsed.type}`,
    parsed.priority && `${parsed.priority} priority`,
    parsed.quantity !== null && quantityText(parsed.quantity, parsed.unit ?? ''),
  ].filter((c): c is string => Boolean(c));
  if (chips.length === 0 && parsed.warnings.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {chips.map((text) => (
        <span
          key={text}
          className={cn(
            chip,
            'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
          )}
        >
          {text}
        </span>
      ))}
      {parsed.warnings
        .filter((w) => w !== 'Type a title')
        .map((w) => (
          <span
            key={w}
            className={cn(
              chip,
              'bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
            )}
          >
            {w}
          </span>
        ))}
    </div>
  );
}
