import { defineConfig } from 'vitest/config';

// End-to-end smoke test: launches the built app (run `pnpm build` first) with Playwright.
// Needs a display; on Linux CI it runs under xvfb-run. Not part of `pnpm test`.
export default defineConfig({
  test: {
    name: 'e2e',
    environment: 'node',
    include: ['e2e/**/*.e2e.ts'],
    testTimeout: 120_000,
    hookTimeout: 60_000,
  },
});
