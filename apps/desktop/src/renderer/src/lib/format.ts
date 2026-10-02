/** "86.25%", or an em dash when there is no value yet. */
export function formatPercent(value: number | null): string {
  if (value === null) return '—';
  return `${Number(value.toFixed(2))}%`;
}

/** A UTC instant shown in the laptop's current time zone (ADR 0007). */
export function formatDateTime(iso: string | null): string {
  if (!iso) return 'never';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** The message of a failed `window.api.invoke`, without Electron's prefix. */
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, '');
}
