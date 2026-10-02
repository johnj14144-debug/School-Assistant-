/**
 * A made-up course for trying the database end to end before the Grade Calc screens exist
 * (M2). Delete it from the debug list when done.
 */
export async function addSampleCourse(): Promise<void> {
  const course = await window.api.invoke('course:create', {
    name: 'Calculus I (sample)',
    code: 'MATH 2413',
    term: 'Fall 2026',
  });
  const add = (name: string, weight: number, dropLowest = 0) =>
    window.api.invoke('category:create', { courseId: course.id, name, weight, dropLowest });
  const homework = await add('Homework', 20, 1);
  const quizzes = await add('Quizzes', 15);
  const exams = await add('Exams', 40);
  const final = await add('Final exam', 25);

  const work: Array<[string, string, number, number | null, boolean?]> = [
    [homework.id, 'HW 1', 20, 18],
    [homework.id, 'HW 2', 20, 11],
    [homework.id, 'HW 3', 20, 19],
    [homework.id, 'HW 4', 20, null],
    [homework.id, 'Bonus problem set', 5, 5, true],
    [quizzes.id, 'Quiz 1', 10, 8],
    [quizzes.id, 'Quiz 2', 10, null],
    [exams.id, 'Exam 1', 100, 84],
    [exams.id, 'Exam 2', 100, null],
    [final.id, 'Final exam', 100, null],
  ];
  for (const [categoryId, title, pointsPossible, pointsEarned, extraCredit = false] of work) {
    await window.api.invoke('assignment:create', {
      courseId: course.id,
      categoryId,
      title,
      pointsPossible,
      pointsEarned,
      extraCredit,
    });
  }
}
