import { describe, it, expect, vi, afterEach } from 'vitest';
import { createShareClient, type FetchLike } from '../src/core/shareClient';
import {
  SHARE_BASE_URL,
  type SharedWorkout,
  serializeSharedWorkout,
  shareIdFor,
} from '../src/core/share';

const workout = (over: Partial<SharedWorkout> = {}): SharedWorkout => ({
  version: 1,
  name: 'Quick 20',
  segments: [
    { intensity: 'easy', durationSec: 120 },
    { intensity: 'allout', durationSec: 30, label: 'Sprint' },
  ],
  ...over,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

/** A fetch stub that answers every call with `respond()` and records the calls. */
function stubFetch(respond: () => Response | Promise<Response>) {
  return vi.fn<FetchLike>(async () => respond());
}

const ID = 'AbC123_-xY';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('shareClient.share', () => {
  it('POSTs the canonical workout to the share API on SHARE_BASE_URL', async () => {
    const fetch = stubFetch(() => json({ id: ID, url: `${SHARE_BASE_URL}/w/${ID}` }));
    await createShareClient({ fetch }).share(workout());
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(`${SHARE_BASE_URL}/api/w`);
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json');
    expect(init?.body).toBe(serializeSharedWorkout(workout()));
  });

  it('sends the normalized form (trimmed name), not the raw input', async () => {
    const fetch = stubFetch(() => json({ id: ID }));
    await createShareClient({ fetch }).share(workout({ name: '  Quick 20  ' }));
    expect(fetch.mock.calls[0][1]?.body).toBe(serializeSharedWorkout(workout()));
  });

  it('returns the id and the web link built from the base URL', async () => {
    const fetch = stubFetch(() => json({ id: ID, url: 'https://elsewhere.example/w/x' }));
    const r = await createShareClient({ fetch }).share(workout());
    expect(r).toEqual({ ok: true, id: ID, url: `${SHARE_BASE_URL}/w/${ID}` });
  });

  it('accepts a 201 Created as success', async () => {
    const fetch = stubFetch(() => json({ id: ID }, 201));
    const r = await createShareClient({ fetch }).share(workout());
    expect(r.ok).toBe(true);
  });

  it('honours a custom base URL (trailing slash ignored)', async () => {
    const fetch = stubFetch(() => json({ id: ID }));
    const r = await createShareClient({ fetch, baseUrl: 'http://localhost:8787/' }).share(
      workout(),
    );
    expect(fetch.mock.calls[0][0]).toBe('http://localhost:8787/api/w');
    expect(r).toEqual({ ok: true, id: ID, url: `http://localhost:8787/w/${ID}` });
  });

  it('rejects an invalid workout locally without calling the API', async () => {
    const fetch = stubFetch(() => json({ id: ID }));
    const r = await createShareClient({ fetch }).share(
      workout({ segments: [{ intensity: 'easy', durationSec: 7 }] }),
    );
    expect(fetch).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/multiple of 5 seconds/);
  });

  it("reports the server's reason on a 400", async () => {
    const fetch = stubFetch(() => json({ error: 'Workout has no segments' }, 400));
    const r = await createShareClient({ fetch }).share(workout());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Workout has no segments/);
  });

  it('reports a server error with its status', async () => {
    const fetch = stubFetch(() => new Response('boom', { status: 500 }));
    const r = await createShareClient({ fetch }).share(workout());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/500/);
  });

  it('reports a network failure', async () => {
    const fetch = vi.fn<FetchLike>(async () => {
      throw new TypeError('Failed to fetch');
    });
    const r = await createShareClient({ fetch }).share(workout());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/couldn't reach/i);
  });

  it('rejects a success response without a valid id', async () => {
    for (const body of [{}, { id: 'short' }, { id: 42 }, 'not json']) {
      const fetch = stubFetch(() =>
        typeof body === 'string' ? new Response(body, { status: 200 }) : json(body),
      );
      const r = await createShareClient({ fetch }).share(workout());
      expect(r.ok).toBe(false);
    }
  });

  it('uses the global fetch when none is injected', async () => {
    const fetch = stubFetch(() => json({ id: ID }));
    vi.stubGlobal('fetch', fetch);
    const r = await createShareClient().share(workout());
    expect(fetch).toHaveBeenCalledOnce();
    expect(r.ok).toBe(true);
  });
});

describe('shareClient.fetchShared', () => {
  it('GETs the workout for a pasted web link and validates it', async () => {
    const fetch = stubFetch(() => new Response(serializeSharedWorkout(workout())));
    const r = await createShareClient({ fetch }).fetchShared(`  ${SHARE_BASE_URL}/w/${ID}  `);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][0]).toBe(`${SHARE_BASE_URL}/api/w/${ID}`);
    expect(fetch.mock.calls[0][1]?.method ?? 'GET').toBe('GET');
    expect(r).toEqual({ ok: true, id: ID, workout: workout() });
  });

  it('accepts a deep link or a bare id', async () => {
    for (const link of [`rowalong://w/${ID}`, ID]) {
      const fetch = stubFetch(() => new Response(serializeSharedWorkout(workout())));
      const r = await createShareClient({ fetch }).fetchShared(link);
      expect(fetch.mock.calls[0][0]).toBe(`${SHARE_BASE_URL}/api/w/${ID}`);
      expect(r.ok).toBe(true);
    }
  });

  it('round-trips an id produced by share-core', async () => {
    const id = await shareIdFor(workout());
    const fetch = stubFetch(() => new Response(serializeSharedWorkout(workout())));
    const r = await createShareClient({ fetch }).fetchShared(`${SHARE_BASE_URL}/w/${id}`);
    expect(r).toEqual({ ok: true, id, workout: workout() });
  });

  it('rejects a bad link without calling the API', async () => {
    for (const link of ['', '   ', 'hello', 'https://example.com/w/AbC123_-xY', `${SHARE_BASE_URL}/x/${ID}`]) {
      const fetch = stubFetch(() => new Response(serializeSharedWorkout(workout())));
      const r = await createShareClient({ fetch }).fetchShared(link);
      expect(fetch).not.toHaveBeenCalled();
      expect(r.ok).toBe(false);
    }
  });

  it('reports an unknown id (404) as not found', async () => {
    const fetch = stubFetch(() => json({ error: 'Not found' }, 404));
    const r = await createShareClient({ fetch }).fetchShared(ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/no shared workout/i);
  });

  it('reports a server error with its status', async () => {
    const fetch = stubFetch(() => new Response('', { status: 503 }));
    const r = await createShareClient({ fetch }).fetchShared(ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/503/);
  });

  it('rejects a payload that fails validation', async () => {
    const fetch = stubFetch(() =>
      json({ version: 1, name: 'x', segments: [{ intensity: 'warp', durationSec: 5 }] }),
    );
    const r = await createShareClient({ fetch }).fetchShared(ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown intensity/);
  });

  it('reports a network failure', async () => {
    const fetch = vi.fn<FetchLike>(async () => {
      throw new TypeError('Failed to fetch');
    });
    const r = await createShareClient({ fetch }).fetchShared(ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/couldn't reach/i);
  });

  it('parses links against a custom base URL', async () => {
    const fetch = stubFetch(() => new Response(serializeSharedWorkout(workout())));
    const r = await createShareClient({ fetch, baseUrl: 'http://localhost:8787' }).fetchShared(
      `http://localhost:8787/w/${ID}`,
    );
    expect(fetch.mock.calls[0][0]).toBe(`http://localhost:8787/api/w/${ID}`);
    expect(r.ok).toBe(true);
  });
});
