import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
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
  },
});
