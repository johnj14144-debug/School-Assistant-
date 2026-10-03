import {
  addDays,
  type LocalDate,
  type LocalDateTime,
  type LocalTime,
  weekday,
} from '../time/local-date';
import { END_OF_DAY, parseDateOnly, parseTime } from '../time/parse-date';
import { parseDuration } from './duration';
import type { TaskPriority } from './schemas';

/**
 * The quick-add line (Ctrl+K), e.g.
 *
 *   Calc HW 3 tomorrow 5pm ~90m #math2413 @homework !
 *   Read pages 45-60 fri
 *   "SAT practice" next sat ~2h
 *
 * Understood anywhere in the line (the first of each kind wins):
 * - **due**: today, tonight, tomorrow (tmrw), a weekday (the next one, never today), next
 *   <weekday> (a week after that), in 3 days, in 2 weeks, 10/7, Oct 7, 2026-10-07; optionally
 *   preceded by due/by/on and followed by a time (5pm, 5:30 pm, at 17:00). A time alone means
 *   today. Without a time, 11:59 pm. All-caps words like SAT are never weekdays.
 * - **estimate**: ~90m, ~1.5h, ~1h30
 * - **priority**: ! or !high, !low, !normal
 * - **course**: #code or #name, matched without spaces or case against the start of the code
 *   or of any word of the name ("#math" fits MATH 2413 if no other course starts that way;
 *   "#american" fits The American West)
 * - **type**: @homework, @exam-prep ("exam prep")
 * - **quantity**: 12 problems, 30 pages, pages 45-60 (16 pages). It stays in the title.
 *
 * Anything in "double quotes" is kept as typed. Due dates come back as local wall-clock parts
 * (ADR 0007).
 */

export interface QuickAddCourse {
  id: string;
  code: string;
  name: string;
}

export interface QuickAddOptions {
  today: LocalDate;
  courses: readonly QuickAddCourse[];
}

export type QuickAddPartKind = 'due' | 'estimate' | 'priority' | 'course' | 'type' | 'quantity';

export interface QuickAdd {
  title: string;
  due: LocalDateTime | null;
  estimateMin: number | null;
  priority: TaskPriority | null;
  courseId: string | null;
  type: string | null;
  quantity: number | null;
  /** Plural, e.g. "problems". */
  unit: string | null;
  /** What was understood, as typed, in order (for a preview). */
  parts: { kind: QuickAddPartKind; text: string }[];
  warnings: string[];
}

const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

/** Unit aliases → the plural stored on the task. */
const UNITS: Record<string, string> = {};
for (const [unit, aliases] of Object.entries({
  problems: ['problem', 'problems', 'prob', 'probs'],
  pages: ['page', 'pages', 'pg', 'pgs', 'p', 'pp'],
  questions: ['question', 'questions'],
  exercises: ['exercise', 'exercises'],
  chapters: ['chapter', 'chapters', 'ch', 'chs'],
  sections: ['section', 'sections', 'sec'],
  words: ['word', 'words'],
  slides: ['slide', 'slides'],
  cards: ['card', 'cards', 'flashcard', 'flashcards'],
  videos: ['video', 'videos'],
  lectures: ['lecture', 'lectures'],
  lessons: ['lesson', 'lessons'],
})) {
  for (const alias of aliases) UNITS[alias] = unit;
}

const PRIORITY = /^!(!|h|high|l|low|n|normal)?$/i;
const COURSE_TAG = /^#([a-z][\w-]*)$/i;
const TYPE_TAG = /^@([a-z][\w-]*)$/i;
const NUMBER = /^\d+(?:\.\d+)?$/;
const RANGE = /^(\d+)[-–](\d+)$/;

interface Token {
  text: string;
  quoted: boolean;
  used: boolean;
}

function tokenize(text: string): Token[] {
  // A quote still being typed runs to the end of the line.
  return [...text.matchAll(/"([^"]*)"?|(\S+)/g)].map((m) => ({
    text: m[1] ?? m[2] ?? '',
    quoted: m[1] !== undefined,
    used: false,
  }));
}

/** Lowercase without trailing punctuation ("Oct," → "oct"). */
const word = (token: Token | undefined) =>
  token && !token.quoted ? token.text.toLowerCase().replace(/[.,;:]+$/, '') : '';

/** "SAT", "FRI": a 2+ letter all-caps word is an acronym, not a weekday. */
const isAcronym = (text: string) => /^[A-Z]{2,}$/.test(text.replace(/[.,;:]+$/, ''));

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function nextWeekday(today: LocalDate, day: number): LocalDate {
  return addDays(today, ((day - weekday(today) + 6) % 7) + 1);
}

interface Match<T> {
  value: T;
  length: number;
}

function matchDate(tokens: Token[], i: number, today: LocalDate): Match<LocalDate> | null {
  const w = word(tokens[i]);
  if (!w) return null;
  if (w === 'today' || w === 'tonight') return { value: today, length: 1 };
  if (w === 'tomorrow' || w === 'tmrw' || w === 'tmr') {
    return { value: addDays(today, 1), length: 1 };
  }
  const weekdayAt = (j: number) => {
    const token = tokens[j];
    const day = WEEKDAYS[word(token)];
    return token && day !== undefined && !isAcronym(token.text) ? day : undefined;
  };
  if (w === 'next') {
    const day = weekdayAt(i + 1);
    if (day !== undefined) return { value: addDays(nextWeekday(today, day), 7), length: 2 };
  }
  const day = weekdayAt(i);
  if (day !== undefined) return { value: nextWeekday(today, day), length: 1 };
  if (w === 'in') {
    const amount = word(tokens[i + 1]);
    const unit = word(tokens[i + 2]);
    const n = amount === 'a' || amount === 'one' ? 1 : NUMBER.test(amount) ? Number(amount) : NaN;
    if (Number.isInteger(n) && /^days?$/.test(unit)) {
      return { value: addDays(today, n), length: 3 };
    }
    if (Number.isInteger(n) && /^weeks?$/.test(unit)) {
      return { value: addDays(today, n * 7), length: 3 };
    }
  }
  // "October 7th, 2026", "Oct 7", "10/7", "2026-10-07"
  for (const length of [3, 2, 1]) {
    const slice = tokens.slice(i, i + length);
    if (slice.length < length || slice.some((t) => t.quoted || t.used)) continue;
    const text = slice
      .map((t) => t.text)
      .join(' ')
      .replace(/[.;:]+$/, '')
      .replace(/,$/, '');
    const date = parseDateOnly(text, today);
    if (date) return { value: date, length };
  }
  return null;
}

function matchTime(tokens: Token[], i: number): Match<LocalTime> | null {
  const at = word(tokens[i]) === 'at' ? 1 : 0;
  const first = tokens[i + at];
  if (!first || first.quoted || first.used) return null;
  const next = word(tokens[i + at + 1]);
  if (/^(am|pm|a\.m|p\.m)$/.test(next)) {
    const time = parseTime(`${first.text} ${next}`);
    if (time) return { value: time, length: at + 2 };
  }
  const time = parseTime(first.text.replace(/[,;]+$/, ''));
  return time ? { value: time, length: at + 1 } : null;
}

function matchCourse(tag: string, courses: readonly QuickAddCourse[]) {
  const wanted = normalize(tag);
  const exact = courses.filter((c) => normalize(c.code) === wanted);
  if (exact.length === 1) return exact;
  // The code, or the name from any word on ("#american" fits "The American West").
  const nameStarts = (name: string) => {
    const words = name.split(/\s+/);
    return words.some((_, k) => normalize(words.slice(k).join('')).startsWith(wanted));
  };
  return courses.filter((c) => normalize(c.code).startsWith(wanted) || nameStarts(c.name));
}

export function parseQuickAdd(text: string, options: QuickAddOptions): QuickAdd {
  const { today } = options;
  const tokens = tokenize(text);
  const result: QuickAdd = {
    title: '',
    due: null,
    estimateMin: null,
    priority: null,
    courseId: null,
    type: null,
    quantity: null,
    unit: null,
    parts: [],
    warnings: [],
  };
  const parts: { kind: QuickAddPartKind; text: string; at: number }[] = [];
  let date: LocalDate | null = null;
  let time: LocalTime | null = null;

  const use = (kind: QuickAddPartKind, i: number, length: number) => {
    const slice = tokens.slice(i, i + length);
    for (const t of slice) t.used = true;
    parts.push({ kind, text: slice.map((t) => t.text).join(' '), at: i });
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token || token.quoted || token.used) continue;
    const raw = token.text;

    if (raw.startsWith('~') && raw.length > 1 && result.estimateMin === null) {
      // "~1h 30m" may span two tokens.
      const withNext = tokens[i + 1]?.quoted ? null : tokens[i + 1]?.text;
      const two =
        withNext && /^\d+m/i.test(withNext) ? parseDuration(`${raw.slice(1)} ${withNext}`) : null;
      const minutes = two ?? parseDuration(raw.slice(1));
      if (minutes !== null) {
        result.estimateMin = minutes;
        use('estimate', i, two !== null ? 2 : 1);
      } else {
        result.warnings.push(`"${raw}" isn't a duration (try ~45m or ~1h30)`);
      }
      continue;
    }

    const priority = PRIORITY.exec(raw);
    if (priority && result.priority === null) {
      const level = (priority[1] ?? '!').toLowerCase();
      result.priority = level.startsWith('l') ? 'low' : level.startsWith('n') ? 'normal' : 'high';
      use('priority', i, 1);
      continue;
    }

    const courseTag = COURSE_TAG.exec(raw);
    if (courseTag?.[1] && result.courseId === null) {
      const matches = matchCourse(courseTag[1], options.courses);
      const [only] = matches;
      if (matches.length === 1 && only) {
        result.courseId = only.id;
        use('course', i, 1);
      } else if (matches.length === 0) {
        result.warnings.push(`No course matches ${raw}`);
      } else {
        const names = matches.map((c) => c.code || c.name).join(', ');
        result.warnings.push(`${raw} could be ${names}; type more of it`);
      }
      continue;
    }

    const typeTag = TYPE_TAG.exec(raw);
    if (typeTag?.[1] && result.type === null) {
      result.type = typeTag[1].toLowerCase().replace(/[-_]+/g, ' ');
      use('type', i, 1);
      continue;
    }

    if (date === null) {
      const keyword = ['due', 'by', 'on'].includes(word(token)) ? 1 : 0;
      const found = matchDate(tokens, i + keyword, today);
      if (found) {
        date = found.value;
        let length = keyword + found.length;
        if (time === null) {
          const after = matchTime(tokens, i + length);
          if (after) {
            time = after.value;
            length += after.length;
          }
        }
        use('due', i, length);
        i += length - 1;
        continue;
      }
    }

    if (time === null) {
      const keyword = word(token) === 'due' || word(token) === 'by' ? 1 : 0;
      const found = matchTime(tokens, i + keyword);
      if (found) {
        time = found.value;
        use('due', i, keyword + found.length);
        i += keyword + found.length - 1;
      }
    }
  }

  // Quantities stay in the title, so they are found in a second pass.
  for (let i = 0; i < tokens.length && result.quantity === null; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];
    if (!token || !next || token.quoted || token.used || next.quoted || next.used) continue;
    const unitAfter = UNITS[word(next)];
    if (NUMBER.test(token.text) && unitAfter) {
      result.quantity = Number(token.text);
      result.unit = unitAfter;
      parts.push({ kind: 'quantity', text: `${token.text} ${next.text}`, at: i });
      continue;
    }
    const unitBefore = UNITS[word(token)];
    const range = RANGE.exec(next.text.replace(/[.,;:]+$/, ''));
    if (unitBefore && range && Number(range[2]) >= Number(range[1])) {
      result.quantity = Number(range[2]) - Number(range[1]) + 1;
      result.unit = unitBefore;
      parts.push({ kind: 'quantity', text: `${token.text} ${next.text}`, at: i });
    }
  }

  if (date || time) result.due = { ...(date ?? today), ...(time ?? END_OF_DAY) };
  result.title = tokens
    .filter((t) => !t.used)
    .map((t) => t.text)
    .join(' ')
    .replace(/[\s,;:–-]+$/, '')
    .trim();
  if (!result.title) result.warnings.push('Type a title');
  result.parts = parts.sort((a, b) => a.at - b.at).map(({ kind, text }) => ({ kind, text }));
  return result;
}
