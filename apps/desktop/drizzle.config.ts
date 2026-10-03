import { defineConfig } from 'drizzle-kit';

// Generates SQL migrations from the schema (`pnpm --filter @sa/desktop db:generate`). The app
// embeds and applies them itself at startup (src/main/db/migrate.ts, ADR 0008).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './src/main/db/migrations',
});
