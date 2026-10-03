import type { GradeCategory } from '@sa/core';
import type { SelectHTMLAttributes } from 'react';

interface CategorySelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> {
  categories: GradeCategory[];
  value: string | null;
  onChange: (categoryId: string | null) => void;
  emptyLabel?: string;
}

/** Picks one of the course's grading categories, or none. */
export function CategorySelect({
  categories,
  value,
  onChange,
  emptyLabel = 'No category',
  ...props
}: CategorySelectProps) {
  return (
    <select
      {...props}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
    >
      <option value="">{emptyLabel}</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
