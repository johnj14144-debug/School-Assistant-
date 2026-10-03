import { type InputHTMLAttributes, useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { cellInputClass } from './inputs';

interface EditableCellProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'> {
  value: string;
  /**
   * Called on blur or Enter when the text changed. Return (or resolve to) `false`, or throw, to
   * reject: the cell reverts and shows a red border.
   */
  onCommit: (value: string) => unknown;
  /** Called after Enter commits, e.g. to move to the next row. */
  onEnter?: () => void;
}

/** A table cell that edits in place: Enter or leaving the cell saves, Escape cancels. */
export function EditableCell({ value, onCommit, onEnter, className, ...props }: EditableCellProps) {
  const [draft, setDraft] = useState(value);
  const [failed, setFailed] = useState(false);
  const focused = useRef(false);
  const cancelled = useRef(false);

  // Follow outside changes (e.g. after a reload) unless the user is typing here.
  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  async function commit() {
    if (draft === value) return;
    let ok: boolean;
    try {
      ok = (await onCommit(draft)) !== false;
    } catch {
      ok = false;
    }
    setFailed(!ok);
    if (!ok) setDraft(value);
  }

  return (
    <input
      {...props}
      value={draft}
      aria-invalid={failed || undefined}
      className={cn(cellInputClass, failed && 'border-red-400', className)}
      onFocus={(e) => {
        focused.current = true;
        e.currentTarget.select();
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
          onEnter?.();
        } else if (e.key === 'Escape') {
          cancelled.current = true;
          setDraft(value);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
