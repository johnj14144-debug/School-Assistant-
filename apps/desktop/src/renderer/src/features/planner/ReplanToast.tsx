import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useIpcEvent } from '../../lib/useIpc';
import { replanToast } from './planText';

const SHOW_MS = 12_000;

/** What a re-plan moved (M6), for a few seconds at the bottom right; from any page. */
export function ReplanToast() {
  const [toast, setToast] = useState<ReturnType<typeof replanToast>>(null);
  useIpcEvent('planner:replanned', (run) => {
    const next = replanToast(run, new Date());
    if (next) setToast(next);
  });
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), SHOW_MS);
    return () => clearTimeout(id);
  }, [toast]);
  if (!toast) return null;

  return (
    <div
      role="status"
      aria-label="Plan changes"
      className="fixed right-4 bottom-4 z-40 w-80 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
    >
      <div className="flex items-start gap-2">
        <RefreshCw className="mt-0.5 size-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
        <p className="min-w-0 flex-1 font-medium">{toast.heading}</p>
        <button
          type="button"
          aria-label="Dismiss"
          className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
          onClick={() => setToast(null)}
        >
          ×
        </button>
      </div>
      {toast.lines.length > 0 && (
        <ul className="mt-1 grid gap-0.5 pl-6 text-zinc-600 dark:text-zinc-400">
          {toast.lines.map((line) => (
            <li key={line} className="truncate" title={line}>
              {line}
            </li>
          ))}
        </ul>
      )}
      <Link
        to="/calendar"
        className="mt-1 block pl-6 text-indigo-700 hover:underline dark:text-indigo-300"
        onClick={() => setToast(null)}
      >
        Open calendar
      </Link>
    </div>
  );
}
