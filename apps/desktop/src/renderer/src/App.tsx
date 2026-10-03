import { useEffect, useState } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router';
import type { IpcOutput } from '../../shared/ipc';
import { StartupError } from './components/StartupError';
import { CommandPalette } from './features/palette/CommandPalette';
import { TaskActionsProvider } from './features/timer/TaskActions';
import { TimerBar } from './features/timer/TimerBar';
import { cn } from './lib/cn';
import { type AppRoute, pageRoutes, routes } from './routes';

function SidebarLink({ path, label, icon: Icon }: AppRoute) {
  return (
    <NavLink
      to={path}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
          isActive
            ? 'bg-indigo-50 font-medium text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300'
            : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800',
        )
      }
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </NavLink>
  );
}

export function App() {
  const [status, setStatus] = useState<IpcOutput<'app:status'> | null>(null);

  useEffect(() => {
    void window.api.invoke('app:status').then(setStatus);
  }, []);

  if (!status) return null;
  if (!status.ok) return <StartupError failure={status} />;
  return (
    <TaskActionsProvider>
      <Layout />
    </TaskActionsProvider>
  );
}

function Layout() {
  return (
    <div className="flex h-full bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-4 flex items-center gap-2 px-2 pt-1">
          <span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
            SA
          </span>
          <span className="whitespace-nowrap text-sm font-semibold">School Assistant</span>
        </div>
        {routes
          .filter((route) => !route.footer)
          .map((route) => (
            <SidebarLink key={route.path} {...route} />
          ))}
        <div className="mt-auto">
          {routes
            .filter((route) => route.footer)
            .map((route) => (
              <SidebarLink key={route.path} {...route} />
            ))}
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <TimerBar />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            {[...routes, ...pageRoutes].map(({ path, element }) => (
              <Route key={path} path={path} element={element} />
            ))}
          </Routes>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
