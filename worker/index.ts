// Entry module of the `rowalong` Worker (wrangler.jsonc `main`). workerd treats
// every named export of the entry as an entrypoint and refuses to start if one
// isn't a handler, so keep this file to the default export; the logic and its
// constants live in ./handler.
import { Env, handleRequest } from './handler';

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};
