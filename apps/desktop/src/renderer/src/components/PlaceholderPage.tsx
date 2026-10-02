import type { ReactNode } from 'react';

interface PlaceholderPageProps {
  title: string;
  description: string;
  milestone: string;
  children?: ReactNode;
}

/** Stand-in for a screen that a later milestone builds (see docs/ROADMAP.md). */
export function PlaceholderPage({ title, description, milestone, children }: PlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-3xl px-10 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">{description}</p>
      <span className="mt-4 inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
        Arrives in {milestone}
      </span>
      {children}
    </div>
  );
}
