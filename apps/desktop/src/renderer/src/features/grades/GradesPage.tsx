import { PlaceholderPage } from '../../components/PlaceholderPage';
import { GradesDebugList } from './GradesDebugList';

export function GradesPage() {
  return (
    <PlaceholderPage
      title="Grades"
      description="Every course and assignment, your current grade, and the best grade still possible."
      milestone="M2"
    >
      <GradesDebugList />
    </PlaceholderPage>
  );
}
