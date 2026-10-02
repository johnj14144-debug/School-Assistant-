import {
  CalendarDays,
  Compass,
  FileText,
  GraduationCap,
  ListTodo,
  type LucideIcon,
  Settings,
  Sun,
} from 'lucide-react';
import type { ReactElement } from 'react';
import { CalendarPage } from './features/calendar/CalendarPage';
import { CoachPage } from './features/coach/CoachPage';
import { GradesPage } from './features/grades/GradesPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { TasksPage } from './features/tasks/TasksPage';
import { TodayPage } from './features/today/TodayPage';

export interface AppRoute {
  path: string;
  label: string;
  icon: LucideIcon;
  element: ReactElement;
  /** Footer routes sit at the bottom of the sidebar. */
  footer?: boolean;
}

export const routes: AppRoute[] = [
  { path: '/today', label: 'Today', icon: Sun, element: <TodayPage /> },
  { path: '/calendar', label: 'Calendar', icon: CalendarDays, element: <CalendarPage /> },
  { path: '/tasks', label: 'Tasks', icon: ListTodo, element: <TasksPage /> },
  { path: '/grades', label: 'Grades', icon: GraduationCap, element: <GradesPage /> },
  { path: '/coach', label: 'Coach', icon: Compass, element: <CoachPage /> },
  { path: '/reports', label: 'Reports', icon: FileText, element: <ReportsPage /> },
  { path: '/settings', label: 'Settings', icon: Settings, element: <SettingsPage />, footer: true },
];
