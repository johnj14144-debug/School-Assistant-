import type { TaskCreate } from '@sa/core';
import { type FormEvent, useState } from 'react';
import { inputClass } from '../../components/inputs';
import { cn } from '../../lib/cn';
import { useIpcQuery } from '../../lib/useIpc';
import { useTaskActions } from '../timer/TaskActions';
import { QuickAddPreview } from './QuickAddPreview';
import { createInput, defaultDueLabel, parseLine } from './quickAdd';

interface QuickAddInputProps {
  placeholder: string;
  /** Added to every task created here (e.g. parentId, today). */
  extra?: Partial<TaskCreate>;
  'aria-label': string;
  className?: string;
}

/** A one-line "add a task" box that understands the quick-add shortcuts; Enter adds. */
export function QuickAddInput({ placeholder, extra, className, ...props }: QuickAddInputProps) {
  const { run } = useTaskActions();
  const { data: courses } = useIpcQuery('course:list');
  const [text, setText] = useState('');
  const parsed = parseLine(text, courses ?? []);

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!parsed.title) return;
    const ok = await run(() => window.api.invoke('task:create', createInput(parsed, extra)));
    if (ok) setText('');
  }

  return (
    <form onSubmit={(e) => void add(e)} className={className}>
      <input
        className={cn(inputClass, 'w-full')}
        placeholder={placeholder}
        aria-label={props['aria-label']}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {text.trim() && (
        <QuickAddPreview
          parsed={parsed}
          courses={courses ?? []}
          defaultDue={defaultDueLabel(extra ?? {})}
          className="mt-1.5"
        />
      )}
    </form>
  );
}
