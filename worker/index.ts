import { handleRequest } from './handler';

/** Entry point of the `rowalong` Worker (`main` in /wrangler.jsonc). The logic
 *  lives in handler.ts; this file only ties it to the real bindings, and the
 *  `satisfies` check fails to compile if KV or assets stop fitting its shapes. */

/** The bindings declared in /wrangler.jsonc. */
interface Env {
  SHARES: KVNamespace;
  ASSETS: Fetcher;
}

export default {
  fetch: (request, env) => handleRequest(request, env),
} satisfies ExportedHandler<Env>;
