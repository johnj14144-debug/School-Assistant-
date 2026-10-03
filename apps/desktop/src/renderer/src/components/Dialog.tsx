import { type ReactNode, useEffect, useRef } from 'react';
import { cn } from '../lib/cn';

interface DialogProps {
  open: boolean;
  /** Called when the dialog closes itself (Escape, or a form with method="dialog"). */
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

/** A modal dialog (native `<dialog>`): focus stays inside, Escape closes it. */
export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // The native close event arrives after a tick; ignore it if the dialog reopened since.
      onClose={() => !ref.current?.open && onClose()}
      aria-label={title}
      className={cn(
        'm-auto w-full max-w-md rounded-xl border border-zinc-200 bg-white p-6 text-zinc-900 shadow-xl backdrop:bg-zinc-950/40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100',
        className,
      )}
    >
      {open && (
        <>
          <h2 className="text-lg font-semibold">{title}</h2>
          {children}
        </>
      )}
    </dialog>
  );
}
