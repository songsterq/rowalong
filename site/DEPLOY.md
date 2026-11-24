# Deploying the RowAlong landing page and share API

This `site/` folder is a self-contained static site. No build step. The same
`rowalong` Worker also serves the share-a-workout API (`/api/workouts`) and the
share-link preview page (`/w/:id`) from `worker/`.

## Cloudflare Workers (static assets + share API)

Deployment is driven by **`/wrangler.jsonc` at the repo root** (not in this
folder). It declares the `rowalong` Worker: `site/` as static assets, plus a
`main` script (`worker/index.ts`) that runs **only** for `/api/*` and `/w/*`
(`assets.run_worker_first`). Every other path is served by the assets layer
exactly as before, and `site/_headers` is honored for those.

On every push to GitHub (`github.com:songsterq/rowalong`), Cloudflare's
Workers Build runs `wrangler deploy` from the repo root, finds that config,
bundles `worker/` (which imports `src/core/share.ts` and `src/ui/format.ts`), and
uploads `site/` — `site/index.html` is served at the project URL.

> **Why the config lives at the root, not here:** wrangler only looks for its
> config in the working directory it runs from (the repo root), never in
> subdirectories. A `wrangler.jsonc` inside `site/` is ignored, and with no root
> config wrangler tries to auto-configure the root `vite.config.ts` (the Electron
> app) and fails. Keep the deploy config at the root.

> Cloudflare static assets cap individual files at 25 MiB. The DMG is ~118 MB, so
> it is **not** part of this folder. It lives in Cloudflare R2 (see below).

wrangler is pinned in `devDependencies` (4.x; older versions can't run the
`compatibility_date`). It needs **Node 22 or later**.

## The KV namespace (shared workouts)

Shared workouts live in one Workers KV namespace, bound as `SHARES`. Each is
stored at key `w:<8-char id>` as normalized JSON (at most 8 KB), forever: links
are immutable and never expire.

`wrangler.jsonc` ships the binding **without an `id`**
(`"kv_namespaces": [{ "binding": "SHARES" }]`). wrangler 4 then provisions a
namespace on the first deploy and reuses it on later ones. That is enough to
deploy, but pin the id so the binding can't silently move to a new, empty
namespace (a renamed Worker, a different account, a wrangler change):

1. Create the namespace once (or reuse the one the first deploy made):

   ```bash
   npx wrangler login                        # once per machine
   npx wrangler kv namespace create SHARES   # prints the new namespace's id
   npx wrangler kv namespace list            # or find an existing one here
   ```

2. Put its id in `wrangler.jsonc` and commit:

   ```jsonc
   "kv_namespaces": [{ "binding": "SHARES", "id": "<namespace id>" }],
   ```

   The id is not a secret; it is useless without the account's API token.

3. Push. Check the deploy log lists `env.SHARES  KV Namespace`, then:

   ```bash
   curl -i https://rowalong.endlessrainstudio.com/api/workouts/ZZZZZZZZ   # 404 JSON
   ```

**Don't change the id after links are out.** Every existing share link resolves
against that namespace; pointing the binding elsewhere makes them all 404.

The per-IP create limit (`ratelimits` → `CREATE_LIMITER`, 5 creates per 60 s
keyed by `CF-Connecting-IP`) needs no setup: `namespace_id` is just an
account-unique number.

## Staying on the free tier

Everything here fits the Workers **Free** plan; nothing needs a card. Limits
that matter (per account, per day, resetting at 00:00 UTC):

| What | Free limit | What uses it |
| --- | --- | --- |
| Worker requests | 100,000 / day | only `/api/*` and `/w/*`; static asset requests are free and don't count |
| KV reads | 100,000 / day | 1 per preview page, import, and share (the id-collision check) |
| KV writes | 1,000 / day | 1 per share, so **at most 1,000 new links a day** |
| KV storage | 1 GB | a workout is ≤ 8 KB, so well over 100,000 links |
| Rate-limit binding | free | no KV writes, so rejected creates cost nothing |

To keep it that way:

- Don't switch the account to Workers Paid "just in case": over-limit requests
  then bill instead of failing.
- Don't add paid-only products (Queues, Logpush, …), and don't swap the
  rate-limit binding for a KV counter: that would spend the 1,000-writes budget
  on every create attempt.
- Keep `run_worker_first` limited to `/api/*` and `/w/*`. Routing `/*` through
  the script would make every landing-page hit count against the 100,000.

If a daily limit is hit, the API and preview fail until the reset; existing
links come back afterwards. Watch usage in the dashboard under Workers & Pages →
`rowalong` → Metrics, and Storage & Databases → KV.

## Running the Worker locally

```bash
npx wrangler dev                                      # http://localhost:8787, local KV in .wrangler/
VITE_SHARE_BASE_URL=http://localhost:8787 npm run dev # the app, sharing against it
```

`wrangler dev` serves the site, the API and `/w/:id` with a local (empty) KV
and rate limiter; nothing touches the real namespace. The app's default base URL
is `SHARE_BASE_URL` in `src/shareConfig.ts` (production); `VITE_SHARE_BASE_URL`
overrides it at dev or build time (`npm run pack` bakes it in, so don't set it
when packaging a release). `npx wrangler deploy --dry-run` checks the bundle
without deploying.

## The download button

The DMG is hosted in **Cloudflare R2**, not on Pages. The three `DOWNLOAD-URL`
hrefs in `index.html` (header, hero, closing band) currently point at:

```
https://rowalongcdn.endlessrainstudio.com/release/RowAlong-1.0.2-arm64.dmg
```

To set up or move it:

1. Upload `release/RowAlong-<version>-arm64.dmg` to the R2 bucket behind that host.
2. Make sure the object is publicly readable at the URL above.
3. If the host or path changes, update every `DOWNLOAD-URL` href in `index.html`
   (search for `DOWNLOAD-URL`; there are three) **and** `DOWNLOAD_URL` in
   `worker/preview.ts` (the share preview page's download buttons).

To bump the version: `npm version <new>` (bumps `package.json` **and**
`package-lock.json`), `npm run pack` to build the DMG, upload it to R2, and only
then update `index.html` — the three `DOWNLOAD-URL` hrefs plus the two version
strings (the closing band's meta line and the footer) — and `DOWNLOAD_URL` in
`worker/preview.ts`.

**Upload before you push.** This page redeploys on every push to `main`, so the
moment the new hrefs land the buttons are live — pointing them at a DMG that
isn't in the bucket yet breaks every download button on the site. Verify with
`curl -I <url>` and expect a `200`.

## Assets

- `hero-bg.jpg` — Unsplash photo (free to use under the Unsplash license).
- `icon.png` — the app icon, copied from `build/icon-1024.png`.
