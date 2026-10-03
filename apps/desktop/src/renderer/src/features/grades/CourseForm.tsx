import { type Course, DEFAULT_LETTER_SCALE, type LetterScale, PLAIN_LETTER_SCALE } from '@sa/core';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/Button';
import { inputClass } from '../../components/inputs';
import { cn } from '../../lib/cn';
import { guessTerm } from '../../lib/dates';
import { COURSE_COLORS } from './palette';

export interface CourseFormValues {
  name: string;
  code: string;
  term: string;
  grading: 'weighted' | 'points';
  color: string | undefined;
  letterScale: LetterScale;
}

interface CourseFormProps {
  /** Editing an existing course; left out when creating. */
  course?: Course;
  submitLabel: string;
  onSubmit: (values: CourseFormValues) => Promise<void>;
  onCancel?: () => void;
}

const sameScale = (a: LetterScale, b: LetterScale) => JSON.stringify(a) === JSON.stringify(b);

/** Name, code, term, grading type, color and letter scale of a course. */
export function CourseForm({ course, submitLabel, onSubmit, onCancel }: CourseFormProps) {
  const [values, setValues] = useState<CourseFormValues>({
    name: course?.name ?? '',
    code: course?.code ?? '',
    term: course?.term ?? guessTerm(),
    grading: course?.grading ?? 'weighted',
    color: course?.color,
    letterScale: course?.letterScale ?? DEFAULT_LETTER_SCALE,
  });
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);
  const set = (patch: Partial<CourseFormValues>) => setValues((v) => ({ ...v, ...patch }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await onSubmit(values);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid max-w-2xl gap-5">
      <div className="grid grid-cols-[1fr_10rem_10rem] gap-3">
        <label className="grid gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Course name</span>
          <input
            className={inputClass}
            ref={nameRef}
            required
            maxLength={120}
            placeholder="Africa and the Oil Industry"
            value={values.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Code</span>
          <input
            className={inputClass}
            maxLength={40}
            placeholder="HIST 4318"
            value={values.code}
            onChange={(e) => set({ code: e.target.value })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-zinc-600 dark:text-zinc-400">Term</span>
          <input
            className={inputClass}
            maxLength={40}
            placeholder="Fall 2026"
            value={values.term}
            onChange={(e) => set({ term: e.target.value })}
          />
        </label>
      </div>

      <fieldset className="grid gap-2 text-sm">
        <legend className="mb-1 text-zinc-600 dark:text-zinc-400">
          How is the grade calculated?
        </legend>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="grading"
            className="mt-1"
            checked={values.grading === 'weighted'}
            onChange={() => set({ grading: 'weighted' })}
          />
          <span>
            <span className="font-medium">Weighted categories</span>
            <span className="text-zinc-500"> — e.g. homework 20%, exams 40% (most courses)</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="grading"
            className="mt-1"
            checked={values.grading === 'points'}
            onChange={() => set({ grading: 'points' })}
          />
          <span>
            <span className="font-medium">Total points</span>
            <span className="text-zinc-500"> — your points divided by all points possible</span>
          </span>
        </label>
      </fieldset>

      <div className="grid gap-1 text-sm">
        <span className="text-zinc-600 dark:text-zinc-400">Color</span>
        <div className="flex gap-2">
          {COURSE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Color ${color}`}
              className={cn(
                'size-7 rounded-full ring-offset-2 dark:ring-offset-zinc-950',
                values.color === color && 'ring-2 ring-zinc-900 dark:ring-zinc-100',
              )}
              style={{ backgroundColor: color }}
              onClick={() => set({ color })}
            />
          ))}
        </div>
      </div>

      <LetterScaleEditor
        value={values.letterScale}
        onChange={(letterScale) => set({ letterScale })}
      />

      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={busy || !values.name.trim()}>
          {submitLabel}
        </Button>
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

function LetterScaleEditor({
  value,
  onChange,
}: {
  value: LetterScale;
  onChange: (scale: LetterScale) => void;
}) {
  const preset = sameScale(value, DEFAULT_LETTER_SCALE)
    ? 'plusminus'
    : sameScale(value, PLAIN_LETTER_SCALE)
      ? 'plain'
      : 'custom';
  const [open, setOpen] = useState(preset === 'custom');

  const update = (index: number, patch: Partial<LetterScale[number]>) =>
    onChange(value.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="grid gap-2 text-sm">
      <span className="text-zinc-600 dark:text-zinc-400">Letter grades</span>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant={preset === 'plusminus' ? 'primary' : 'secondary'}
          onClick={() => onChange(DEFAULT_LETTER_SCALE)}
        >
          A 93 · A− 90 · B+ 87 …
        </Button>
        <Button
          variant={preset === 'plain' ? 'primary' : 'secondary'}
          onClick={() => onChange(PLAIN_LETTER_SCALE)}
        >
          A 90 · B 80 · C 70 · D 60
        </Button>
        <Button
          variant={preset === 'custom' ? 'primary' : 'secondary'}
          onClick={() => setOpen(!open)}
        >
          {open ? 'Hide cutoffs' : 'Edit cutoffs'}
        </Button>
      </div>
      {open && (
        <div className="grid w-64 gap-1">
          {value.map((row, i) => (
            // Rows have no ids and every input is controlled, so the position is the identity.
            // biome-ignore lint/suspicious/noArrayIndexKey: see above
            <div key={i} className="flex items-center gap-2">
              <input
                className={cn(inputClass, 'w-16')}
                aria-label="Letter"
                value={row.letter}
                onChange={(e) => update(i, { letter: e.target.value })}
              />
              <span className="text-zinc-500">from</span>
              <input
                className={cn(inputClass, 'w-20 text-right')}
                aria-label={`Lowest percent for ${row.letter}`}
                inputMode="decimal"
                value={row.minPercent}
                onChange={(e) => update(i, { minPercent: Number(e.target.value) || 0 })}
              />
              <span className="text-zinc-500">%</span>
              <button
                type="button"
                className="ml-auto text-xs text-zinc-500 hover:text-red-600"
                disabled={value.length <= 1}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="justify-self-start text-xs text-indigo-600 hover:underline dark:text-indigo-400"
            onClick={() => onChange([...value, { letter: '?', minPercent: 0 }])}
          >
            + Add a letter
          </button>
        </div>
      )}
    </div>
  );
}
