/**
 * Durations as the user types and reads them. Minutes everywhere in storage.
 *
 * Accepted: "45", "45m", "45 min", "1h", "1.5h", "1 h 30 min", "1h30", "1:30", "2 hours".
 */

const HOURS_MINUTES = /^(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(?:(\d+)\s*(?:m(?:in(?:ute)?s?)?)?)?$/;
const MINUTES = /^(\d+(?:\.\d+)?)\s*(?:m(?:in(?:ute)?s?)?)?$/;
const CLOCK = /^(\d+):([0-5]\d)$/;

/** Whole minutes, or null when the text isn't a duration (blank included). */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (t === '') return null;
  let match = CLOCK.exec(t);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  match = HOURS_MINUTES.exec(t);
  if (match) return Math.round(Number(match[1]) * 60 + Number(match[2] ?? 0));
  match = MINUTES.exec(t);
  if (match) return Math.round(Number(match[1]));
  return null;
}

/** "45m", "1h", "1h 30m" (rounded to the minute). */
export function formatMinutes(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** A running timer: "4:05", "1:02:09". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
