import type { HandlersFor } from '../../ipc';
import type { TasksService } from './service';
import type { TimerService } from './timer';

export function tasksHandlers(
  tasks: TasksService,
  timer: TimerService,
): HandlersFor<'task' | 'today' | 'timer' | 'session' | 'history'> {
  return {
    'task:list': ({ status }) => tasks.list(status),
    'task:get': ({ id }) => tasks.get(id),
    'task:types': () => tasks.types(),
    'task:create': (input) => tasks.create(input),
    'task:update': (input) => tasks.update(input),
    'task:delete': ({ id }) => tasks.delete(id),
    'task:complete': (input) => tasks.complete(input),
    'task:reopen': ({ id }) => tasks.reopen(id),
    'today:get': () => tasks.today(),
    'today:set': ({ id, today }) => tasks.setToday(id, today),
    'today:reorder': ({ ids }) => tasks.reorderToday(ids),
    'timer:state': () => timer.state(),
    'timer:start': ({ taskId, startAt }) => timer.start(taskId, startAt),
    'timer:pause': () => timer.pause(),
    'timer:resume': () => timer.resume(),
    'timer:stop': ({ taskId }) => timer.stop(taskId),
    'session:create': (input) => timer.createSession(input),
    'session:update': (input) => timer.updateSession(input),
    'session:delete': ({ id }) => timer.deleteSession(id),
    'history:get': () => tasks.history(),
  };
}
