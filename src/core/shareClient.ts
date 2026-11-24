import {
  SHARE_API_PATH,
  SHARE_BASE_URL,
  type SharedWorkout,
  isShareId,
  parseShareLink,
  parseSharedWorkout,
  serializeSharedWorkout,
  shareUrlFor,
  validateSharedWorkout,
} from './share';

/** The slice of `fetch` the client uses; inject a stub in tests. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface ShareClientOptions {
  /** Defaults to the global fetch, looked up on each call. */
  fetch?: FetchLike;
  /** Origin of the share API and of the links it hands out. Defaults to SHARE_BASE_URL. */
  baseUrl?: string;
  /** Give up on a request after this long. Default 15 s. */
  timeoutMs?: number;
}

export type ShareOutcome = { ok: true; id: string; url: string } | { ok: false; error: string };

export type FetchSharedOutcome =
  | { ok: true; id: string; workout: SharedWorkout }
  | { ok: false; error: string };

export interface ShareClient {
  /** Validate the workout locally, POST it, and return its id and web link. */
  share(workout: SharedWorkout): Promise<ShareOutcome>;
  /** Parse a pasted link, deep link or bare id, GET the workout, and validate it. */
  fetchShared(link: string): Promise<FetchSharedOutcome>;
}

const DEFAULT_TIMEOUT_MS = 15_000;

const UNREACHABLE = "Couldn't reach the share service. Check your connection and try again.";
const TIMED_OUT = 'The share service took too long to answer. Try again.';

type Sent = { ok: true; res: Response } | { ok: false; error: string };

/** Best-effort `{ error }` from a JSON error body. */
async function serverReason(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string')
      return (body as { error: string }).error;
  } catch {
    // not JSON: fall back to the status
  }
  return null;
}

export function createShareClient(opts: ShareClientOptions = {}): ShareClient {
  const base = (opts.baseUrl ?? SHARE_BASE_URL).replace(/\/+$/, '');
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  // Looked up per call (not captured at creation) so a stubbed global is honoured,
  // and called unbound-safe: a bare `window.fetch` reference throws "Illegal invocation".
  const doFetch: FetchLike = opts.fetch ?? ((url, init) => globalThis.fetch(url, init));

  const send = async (url: string, init: RequestInit): Promise<Sent> => {
    const signal =
      typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(timeoutMs)
        : undefined;
    try {
      return { ok: true, res: await doFetch(url, { ...init, signal }) };
    } catch (e) {
      const name = (e as { name?: unknown } | null)?.name;
      return { ok: false, error: name === 'TimeoutError' ? TIMED_OUT : UNREACHABLE };
    }
  };

  return {
    async share(workout) {
      const v = validateSharedWorkout(workout);
      if (!v.ok) return { ok: false, error: `Can't share this workout: ${v.error}.` };

      const sent = await send(`${base}${SHARE_API_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: serializeSharedWorkout(v.workout),
      });
      if (!sent.ok) return sent;
      const { res } = sent;

      if (!res.ok) {
        const reason = res.status === 400 ? await serverReason(res) : null;
        return {
          ok: false,
          error: reason
            ? `Can't share this workout: ${reason}.`
            : `Couldn't share this workout (server error ${res.status}). Try again later.`,
        };
      }

      let id: unknown;
      try {
        id = ((await res.json()) as { id?: unknown } | null)?.id;
      } catch {
        id = undefined;
      }
      if (typeof id !== 'string' || !isShareId(id))
        return { ok: false, error: "Couldn't share this workout: the share service sent an unexpected answer." };
      // The link is built here from the id, so it always points at the one site host.
      return { ok: true, id, url: shareUrlFor(id, base) };
    },

    async fetchShared(link) {
      if (!link.trim()) return { ok: false, error: 'Paste a share link to import.' };
      const id = parseShareLink(link, base);
      if (!id) return { ok: false, error: "That isn't a RowAlong share link." };

      const sent = await send(`${base}${SHARE_API_PATH}/${id}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!sent.ok) return sent;
      const { res } = sent;

      if (res.status === 404)
        return { ok: false, error: 'No shared workout found at that link. Check it was copied whole.' };
      if (!res.ok)
        return {
          ok: false,
          error: `Couldn't load the shared workout (server error ${res.status}). Try again later.`,
        };

      let body: string;
      try {
        body = await res.text();
      } catch {
        return { ok: false, error: UNREACHABLE };
      }
      const v = parseSharedWorkout(body);
      if (!v.ok) return { ok: false, error: `The shared workout couldn't be read: ${v.error}.` };
      return { ok: true, id, workout: v.workout };
    },
  };
}
