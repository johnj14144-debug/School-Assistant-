import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { fromDateInput, toDateInput } from '../lib/dates';
import { cellInputClass } from './inputs';

interface DateCellProps {
  /** A UTC instant or null. */
  value: string | null;
  /** The new instant (same local time as before, else 11:59 pm), or null when cleared. */
  onCommit: (value: string | null) => unknown;
  className?: string;
  'aria-label'?: string;
}

/**
 * A due-date cell. Saves when the cell is left or on Enter, not on every change: Chromium's date
 * input reports a value while the user is still typing the year.
 */
export function DateCell({ value, onCommit, className, ...props }: DateCellProps) {
  const current = toDateInput(value);
  const [draft, setDraft] = useState(current);
  const [failed, setFailed] = useState(false);
  const focused = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(current);
  }, [current]);

  async function commit() {
    if (draft === current) return;
    let ok: boolean;
    try {
      ok = (await onCommit(fromDateInput(draft, value))) !== false;
    } catch {
      ok = false;
    }
    setFailed(!ok);
    if (!ok) setDraft(current);
  }

  return (
    <input
      type="date"
      aria-label={props['aria-label']}
      value={draft}
      className={cn(
        cellInputClass,
        'text-zinc-700 dark:text-zinc-300',
        failed && 'border-red-400',
        className,
      )}
      onFocus={() => {
        focused.current = true;
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        focused.current = false;
        if (cancelled.current) {
          cancelled.current = false;
          return;
        }
        void commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          cancelled.current = true;
          setDraft(current);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
