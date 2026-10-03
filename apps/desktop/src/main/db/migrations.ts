import type { Migration } from './migrate';

// The SQL files are bundled into the app at build time, so nothing is read from disk at runtime.
const files = import.meta.glob<string>('./migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** Every migration, in order. File names start with a zero-padded index (drizzle-kit). */
export const migrations: Migration[] = Object.entries(files)
  .map(([path, sql]) => ({ name: path.replace(/^.*\//, '').replace(/\.sql$/, ''), sql }))
  .sort((a, b) => a.name.localeCompare(b.name));
