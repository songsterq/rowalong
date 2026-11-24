// Where Share posts workouts and Import fetches them: the production `rowalong`
// Worker (the same host that serves the landing site and the /w/:id preview).
// Override in dev with VITE_SHARE_BASE_URL, e.g. for `wrangler dev`:
//   VITE_SHARE_BASE_URL=http://localhost:8787 npm run dev
// Vite inlines the value at build time, so the packaged Electron app always
// talks to whatever host it was built against.
export const DEFAULT_SHARE_BASE_URL = 'https://rowalong.endlessrainstudio.com';

export const SHARE_BASE_URL: string =
  import.meta.env.VITE_SHARE_BASE_URL || DEFAULT_SHARE_BASE_URL;
