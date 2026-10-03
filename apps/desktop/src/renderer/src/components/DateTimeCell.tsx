import { useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { fromDateTimeInput, toDateTimeInput } from '../lib/dates';
import { cellInputClass } from './inputs';

interface DateTimeCellProps {
  /** A UTC instant or null. */
  value: string | null;
  /** The new instant. Return (or resolve to) `false`, or throw, to revert. */
  onCommit: (value: string) => unknown;
  className?: string;
  'aria-label'?: string;
}

/**
 * A local date-and-time cell. Like DateCell it saves when left or on Enter, never while typing,
 * and an empty or partial value is ignored.
 */
export function DateTimeCell({ value, onCommit, className, ...props }: DateTimeCellProps) {
  const current = toDateTimeInput(value);
  const [draft, setDraft] = useState(current);
  const [failed, setFailed] = useState(false);
  const focused = useRef(false);
  const cancelled = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(current);
  }, [current]);

  async function commit() {
    const iso = fromDateTimeInput(draft);
    if (draft === current || !iso) {
      setDraft(current);
      return;
    }
    let ok: boolean;
    try {
      ok = (await onCommit(iso)) !== false;
    } catch {
      ok = false;
    }
    setFailed(!ok);
    if (!ok) setDraft(current);
  }

  return (
    <input
      type="datetime-local"
      aria-label={props['aria-label']}
      value={draft}
      className={cn(cellInputClass, failed && 'border-red-400', className)}
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
