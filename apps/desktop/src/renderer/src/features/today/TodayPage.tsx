import { PlaceholderPage } from '../../components/PlaceholderPage';

export function TodayPage() {
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
  return (
    <PlaceholderPage
      title={today}
      description="Your current block, a big Start/Stop button, what's next, and how the day is going."
      milestone="M3"
    />
  );
}
