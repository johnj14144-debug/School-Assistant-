import type { HandlersFor } from '../../ipc';
import type { GradesService } from './service';

export function gradesHandlers(
  grades: GradesService,
): HandlersFor<'course' | 'category' | 'assignment'> {
  return {
    'course:list': () => grades.listCourses(),
    'course:get': ({ id }) => grades.getCourse(id),
    'course:create': (input) => grades.createCourse(input),
    'course:update': (input) => grades.updateCourse(input),
    'course:delete': ({ id }) => grades.deleteCourse(id),
    'category:create': (input) => grades.createCategory(input),
    'category:update': (input) => grades.updateCategory(input),
    'category:delete': ({ id }) => grades.deleteCategory(id),
    'assignment:create': (input) => grades.createAssignment(input),
    'assignment:create-many': (inputs) => grades.createAssignments(inputs),
    'assignment:update': (input) => grades.updateAssignment(input),
    'assignment:delete': ({ id }) => grades.deleteAssignment(id),
  };
}
