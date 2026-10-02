import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { errorMessage } from '../../lib/format';
import { CourseForm } from './CourseForm';

export function NewCoursePage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-10 py-12">
      <Link
        to="/grades"
        className="text-sm text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        ← Grades
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold tracking-tight">Add a course</h1>
      {error && <p className="mb-4 text-sm text-red-700">{error}</p>}
      <CourseForm
        submitLabel="Create course"
        onCancel={() => navigate('/grades')}
        onSubmit={async (values) => {
          try {
            const course = await window.api.invoke('course:create', values);
            navigate(`/grades/${course.id}`);
          } catch (e) {
            setError(errorMessage(e));
          }
        }}
      />
    </div>
  );
}
