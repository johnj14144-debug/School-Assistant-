import { useCallback, useState } from 'react';
import { errorMessage } from '../../lib/format';

/**
 * Runs an IPC change from inside a dialog and keeps its error for the dialog to show (the
 * app's error toast sits under a modal dialog's backdrop). Resolves to whether it worked.
 */
export function useDialogAction() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const act = useCallback(async (change: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await change();
      setError(null);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { error, busy, act };
}
