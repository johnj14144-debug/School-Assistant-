/**
 * Runs a change on the course page: on success the course reloads and the result is `true`; on
 * failure the page shows the error and the result is `false` (so an EditableCell reverts).
 */
export type CourseAction = (change: () => Promise<unknown>) => Promise<boolean>;
