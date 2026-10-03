import { useEffect, useState } from 'react';

const query = '(prefers-color-scheme: dark)';

/** The system's light or dark mode (Tailwind's `dark:` follows the same media query). */
export function useColorScheme(): 'light' | 'dark' {
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setDark(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return dark ? 'dark' : 'light';
}
