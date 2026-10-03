interface ErrorToastProps {
  message: string | null;
  onDismiss: () => void;
}

/** A failed action's message, at the bottom of the window until dismissed. */
export function ErrorToast({ message, onDismiss }: ErrorToastProps) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 z-50 flex max-w-lg -translate-x-1/2 items-start gap-3 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm text-red-700 shadow-lg dark:border-red-900 dark:bg-zinc-900 dark:text-red-400"
    >
      <span>{message}</span>
      <button
        type="button"
        aria-label="Dismiss"
        className="text-zinc-400 hover:text-zinc-700"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
