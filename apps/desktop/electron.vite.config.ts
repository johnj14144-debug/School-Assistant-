import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

// Packages in "dependencies" stay external (loaded from node_modules at runtime, e.g. native
// modules). Everything in "devDependencies", including @sa/core, is bundled into the output.
export default defineConfig({
  main: {
    build: { externalizeDeps: true },
  },
  preload: {
    build: { externalizeDeps: true },
  },
  renderer: {
    resolve: {
      alias: { '@renderer': resolve(__dirname, 'src/renderer/src') },
    },
    plugins: [react(), tailwindcss()],
  },
});
