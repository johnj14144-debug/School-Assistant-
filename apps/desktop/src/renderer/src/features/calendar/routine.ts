import {
  DEFAULT_TIME_ZONE,
  type FixedEvent,
  type FixedEventCreate,
  type FixedEventKind,
  formatRRule,
  parseLocalDate,
  parseRRule,
  type Recurrence,
  weekday,
} from '@sa/core';

/**
 * The routine editor's form, kept apart from the JSX so it can be unit-tested: fixed events ↔
 * form fields (repeat rules as day toggles), and how an event's repeat reads in a list.
 */

export type RepeatKind = 'daily' | 'weekly' | 'once';

export interface FixedEventForm {
  kind: FixedEventKind;
  title: string;
  /** '' = no course. */
  courseId: string;
  location: string;
  /** `YYYY-MM-DD`: the first day (or the only day, once). */
  startDate: string;
  startLocal: string;
  endLocal: string;
  repeat: RepeatKind;
  /** Weekdays for a weekly repeat, 0 = Sunday. */
  days: number[];
  /** Every n weeks. */
  interval: number;
  /** `YYYY-MM-DD` or '' for no end. */
  lastDay: string;
  timeZone: string;
}

export const KIND_LABELS: Record<FixedEventKind, string> = {
  class: 'Class',
  sleep: 'Sleep',
  meal: 'Meal',
  hygiene: 'Routine',
  other: 'Other',
};

/** Monday first, as the day toggles show them. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const PRESETS: Record<FixedEventKind, Partial<FixedEventForm>> = {
  class: { title: '', startLocal: '10:00', endLocal: '10:50', repeat: 'weekly' },
  sleep: { title: 'Sleep', startLocal: '23:00', endLocal: '06:30', repeat: 'daily' },
  meal: { title: 'Dinner', startLocal: '20:00', endLocal: '21:00', repeat: 'daily' },
  hygiene: { title: 'Morning routine', startLocal: '06:30', endLocal: '07:00', repeat: 'daily' },
  other: { title: '', startLocal: '17:00', endLocal: '18:00', repeat: 'weekly' },
};

/** A blank form for a new event of `kind`, starting `today`. */
export function newForm(kind: FixedEventKind, today: string): FixedEventForm {
  return {
    kind,
    title: '',
    courseId: '',
    location: '',
    startDate: today,
    startLocal: '09:00',
    endLocal: '10:00',
    repeat: 'weekly',
    days: [],
    interval: 1,
    lastDay: '',
    timeZone: DEFAULT_TIME_ZONE,
    ...PRESETS[kind],
  };
}

const untilText = (rule: Recurrence) =>
  rule.until
    ? `${rule.until.year}-${String(rule.until.month).padStart(2, '0')}-${String(rule.until.day).padStart(2, '0')}`
    : '';

/** The form for an existing event. A daily rule with BYDAY reads as weekly on those days. */
export function formFromEvent(event: FixedEvent): FixedEventForm {
  const base = {
    kind: event.kind,
    title: event.title,
    courseId: event.courseId ?? '',
    location: event.location,
    startDate: event.startDate,
    startLocal: event.startLocal,
    endLocal: event.endLocal,
    timeZone: event.timeZone,
  };
  if (!event.rrule) return { ...base, repeat: 'once', days: [], interval: 1, lastDay: '' };
  const rule = parseRRule(event.rrule);
  const weekly = rule.freq === 'weekly' || rule.byDay.length > 0;
  return {
    ...base,
    repeat: weekly ? 'weekly' : 'daily',
    days: rule.byDay,
    interval: rule.freq === 'weekly' ? rule.interval : 1,
    lastDay: untilText(rule),
  };
}

/** The RRULE text for the form's repeat, or null for once. */
export function rruleFromForm(form: FixedEventForm): string | null {
  if (form.repeat === 'once') return null;
  const lastDay = form.lastDay ? parseLocalDate(form.lastDay) : null;
  const rule: Recurrence = {
    freq: form.repeat,
    interval: form.repeat === 'weekly' ? Math.max(1, Math.round(form.interval)) : 1,
    byDay: form.repeat === 'weekly' ? [...form.days].sort((a, b) => a - b) : [],
    until: lastDay,
    count: null,
  };
  return formatRRule(rule);
}

/** The create/update fields for the form; throws an Error with what to fix. */
export function inputFromForm(form: FixedEventForm): FixedEventCreate {
  const title = form.title.trim();
  if (!title) throw new Error('Give it a title.');
  if (!parseLocalDate(form.startDate)) throw new Error('Pick the first day.');
  if (form.repeat === 'weekly' && form.days.length === 0) throw new Error('Pick at least one day.');
  if (form.lastDay && !parseLocalDate(form.lastDay)) throw new Error('Pick a valid last day.');
  return {
    title,
    kind: form.kind,
    courseId: form.courseId || null,
    location: form.location.trim(),
    startDate: form.startDate,
    startLocal: form.startLocal,
    endLocal: form.endLocal,
    rrule: rruleFromForm(form),
    timeZone: form.timeZone,
  };
}

/** "11:00 PM" for "23:00", in the user's locale. */
export function formatWallTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(2000, 0, 1, h ?? 0, m ?? 0)).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

/** "Oct 7" (plus the year when it isn't `thisYear`). */
export function formatDayText(text: string, thisYear: number): string {
  const d = parseLocalDate(text);
  if (!d) return text;
  return new Date(Date.UTC(d.year, d.month - 1, d.day)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: d.year === thisYear ? undefined : 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * How an event repeats, for lists: "Every day", "Mon, Wed, Fri · until Dec 9", "Every 2 weeks
 * on Tue", "Once, Tue Oct 7", "Every day · from Jan 12".
 */
export function describeRepeat(
  event: Pick<FixedEvent, 'rrule' | 'startDate'>,
  today: string,
): string {
  const thisYear = Number(today.slice(0, 4));
  const first = parseLocalDate(event.startDate);
  if (!event.rrule) {
    const day = first ? WEEKDAY_SHORT[weekday(first)] : '';
    return `Once, ${day} ${formatDayText(event.startDate, thisYear)}`;
  }
  const rule = parseRRule(event.rrule);
  const days = rule.byDay.length > 0 ? rule.byDay : first ? [weekday(first)] : [];
  const dayList = WEEKDAY_ORDER.filter((d) => days.includes(d))
    .map((d) => WEEKDAY_SHORT[d])
    .join(', ');
  let text: string;
  if (rule.freq === 'daily' && rule.byDay.length === 0) {
    text = rule.interval > 1 ? `Every ${rule.interval} days` : 'Every day';
  } else if (rule.freq === 'weekly' && rule.interval > 1) {
    text = `Every ${rule.interval} weeks on ${dayList}`;
  } else {
    text = days.length === 7 ? 'Every day' : dayList;
  }
  const parts = [text];
  if (event.startDate > today) parts.push(`from ${formatDayText(event.startDate, thisYear)}`);
  if (rule.until) parts.push(`until ${formatDayText(untilText(rule), thisYear)}`);
  if (rule.count) parts.push(`${rule.count} times`);
  return parts.join(' · ');
}

/**
 * A starting routine to edit: 7.5 h of sleep, morning and evening routines, and two meals of a
 * full hour (the owner eats twice a day, late dinner, with a walk from the dorm).
 */
export function starterRoutine(today: string): FixedEventCreate[] {
  const daily = { startDate: today, rrule: 'FREQ=DAILY', timeZone: DEFAULT_TIME_ZONE };
  return [
    { ...daily, title: 'Sleep', kind: 'sleep', startLocal: '23:00', endLocal: '06:30' },
    { ...daily, title: 'Morning routine', kind: 'hygiene', startLocal: '06:30', endLocal: '07:00' },
    { ...daily, title: 'Breakfast', kind: 'meal', startLocal: '07:00', endLocal: '08:00' },
    { ...daily, title: 'Dinner', kind: 'meal', startLocal: '20:00', endLocal: '21:00' },
    { ...daily, title: 'Evening routine', kind: 'hygiene', startLocal: '22:30', endLocal: '23:00' },
  ];
}
