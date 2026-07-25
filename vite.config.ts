import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ command }) => ({
  // Built pages load over file:// in the packaged app, so assets must be
  // referenced relatively; the dev server keeps the absolute root base.
  base: command === 'build' ? './' : '/',
  // Fixed port so the Electron main process can rely on the dev server URL.
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: r('./index.html'),
        overlay: r('./overlay.html'),
      },
    },
  },
  test: {
    environment: 'jsdom',
    // Pin a DST-observing zone so local-date logic (src/core/history.ts) is
    // deterministic and DST transitions are actually reachable in tests,
    // instead of depending on whatever TZ the runner/CI happens to have.
    env: { TZ: 'America/Los_Angeles' },
  },
}));
