import { defineConfig } from 'vitest/config';

// Dedicated config so the harness generator runs only on demand (`npm run
// harness`) and never as part of `npm test`. jsdom gives `mountOverlay` a
// document; the generator serializes the result to a static HTML file.
export default defineConfig({
  test: {
    include: ['tools/overlay-harness.ts'],
    environment: 'jsdom',
  },
});
