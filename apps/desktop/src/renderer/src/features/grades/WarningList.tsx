import type { GradeWarning } from '@sa/core';
import { cn } from '../../lib/cn';
import { formatPercent } from '../../lib/format';

export function warningText(warning: GradeWarning): string {
  switch (warning.code) {
    case 'weights_not_100':
      return `Category weights add up to ${formatPercent(warning.total)}, not 100%`;
    case 'uncategorized_ignored':
      return `${warning.count} assignment${warning.count === 1 ? ' has' : 's have'} no category and ${warning.count === 1 ? "isn't" : "aren't"} counted`;
  }
}

export function WarningList({
  warnings,
  className,
}: {
  warnings: GradeWarning[];
  className?: string;
}) {
  if (warnings.length === 0) return null;
  return (
    <ul className={cn('grid gap-1 text-xs text-amber-700 dark:text-amber-400', className)}>
      {warnings.map((w) => (
        <li key={w.code}>⚠ {warningText(w)}</li>
      ))}
    </ul>
  );
}
