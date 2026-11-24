# Deploying the RowAlong landing page

This `site/` folder is a self-contained static site. No build step.

## Cloudflare Workers (static assets + share API)

Deployment is driven by **`/wrangler.jsonc` at the repo root** (not in this
folder). It declares one Worker, `rowalong`, that serves `site/` and also runs
a small script, `worker/index.ts`, for share links:

```jsonc
{
  "name": "rowalong",
  "main": "worker/index.ts",
  "assets": { "directory": "./site", "binding": "ASSETS", "run_worker_first": ["/api/*", "/w/*"] },
  "kv_namespaces": [{ "binding": "SHARES", "id": "<namespace id>" }]
}
```

On every push to GitHub (`github.com:songsterq/rowalong`), Cloudflare's
Workers Build runs `wrangler deploy` from the repo root, finds that config,
bundles the script and uploads `site/`. `site/index.html` is served at the
project URL and `site/_headers` is honored. Only `/api/*` and `/w/*` run the
script; every other path is served straight from `site/` as before. `wrangler`
is a dev dependency, so the build uses the locked version (it needs Node
22.12 or newer).

> **Why the config lives at the root, not here:** wrangler only looks for its
> config in the working directory it runs from (the repo root), never in
> subdirectories. A `wrangler.jsonc` inside `site/` is ignored, and with no root
> config wrangler tries to auto-configure the root `vite.config.ts` (the Electron
> app) and fails. Keep the deploy config at the root.

> Cloudflare static assets cap individual files at 25 MiB. The DMG is ~118 MB, so
> it is **not** part of this folder. It lives in Cloudflare R2 (see below).

## Share links (Workers KV): one-time setup

Shared workouts are stored in a Workers KV namespace bound to the Worker as
`SHARES`. The binding is already declared in `/wrangler.jsonc`, but its `id`
is a placeholder (`PASTE_SHARES_NAMESPACE_ID_HERE`) until you create the
namespace. **Do this before the share code reaches `main`:** with the
placeholder, `wrangler deploy` fails, and the site stays on its previous
version until a deploy succeeds.

From the repo root, signed in to the Cloudflare account that owns the
`rowalong` Worker:

1. `npx wrangler login` (once per machine; opens a browser).
2. `npx wrangler kv namespace create rowalong-shares`. It prints the new
   namespace's `id` (32 hex characters). If it asks
   **"Would you like Wrangler to add it on your behalf?"**, answer **n**: the
   binding is already in the config and only the id is missing.
3. In `/wrangler.jsonc`, replace `PASTE_SHARES_NAMESPACE_ID_HERE` with that id.
   The id is not a secret; commit it.
4. Push to `main`. The Workers Build deploys the script with the binding.

To check it once deployed (this creates one real, permanent link; sharing the
same workout again reuses it):

```sh
curl -i -X POST https://rowalong.endlessrainstudio.com/api/w \
  -H 'Content-Type: application/json' \
  -d '{"version":1,"name":"Deploy check","segments":[{"intensity":"easy","durationSec":60}]}'
# 201 (or 200 the second time) with {"id":"<id>","url":".../w/<id>"}
curl -i https://rowalong.endlessrainstudio.com/api/w/<id>
# 200 with the workout; an unknown id gives 404
# Then open https://rowalong.endlessrainstudio.com/w/<id> in a browser: the
# preview page, with "Deploy check", 1:00 total and one Easy block.
```

The same namespace can be found later in the Cloudflare dashboard under
**Storage & Databases → Workers KV**, or with `npx wrangler kv namespace list`.

How it behaves:

- `POST /api/w` validates the workout (`src/core/share.ts`: known intensities,
  5-second durations, 200 segments, 32 KiB), stores it under a content-hashed
  id only if that id isn't stored yet, with no expiry, and answers
  `{ id, url }`. A bad or oversized workout gets a `400` with `{ error }`.
- `GET /api/w/<id>` returns the workout, or `404`.
- `GET /w/<id>`, the link people open, is an HTML preview page rendered by the
  script (`worker/previewPage.ts`, styled by `styles.css`): name, total time,
  intensity timeline, blocks, and Open in RowAlong (`rowalong://w/<id>`) /
  Download buttons. An unknown id gets a friendly not-found page with a `404`.
  Pages say `noindex`, and the script sets its own security headers and CSP
  (`_headers` doesn't apply to it).
- CORS is open to any origin (the packaged app's origin is `null`).
- Links never expire and there is no delete endpoint. To take one down, delete
  its key in the dashboard or with
  `npx wrangler kv key delete --binding SHARES --remote <id>`.
- Free-tier limits: 1,000 KV writes and 100,000 reads a day. Re-sharing the
  same workout reads but doesn't write.
- Share links use `SHARE_BASE_URL` in `src/core/share.ts`
  (`https://rowalong.endlessrainstudio.com`). If the Worker's custom domain
  changes, change it there.

Run the Worker locally with `npm run worker:dev` (http://localhost:8787). It
uses a local, simulated KV, so it works before the namespace exists.

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
   (search for `DOWNLOAD-URL`; there are three) and `DOWNLOAD_URL` in
   `worker/previewPage.ts`, the share preview page's Download link.

To bump the version: `npm version <new>` (bumps `package.json` **and**
`package-lock.json`), `npm run pack` to build the DMG, upload it to R2, and only
then update `index.html` — the three `DOWNLOAD-URL` hrefs plus the two version
strings (the closing band's meta line and the footer) — and `DOWNLOAD_URL` in
`worker/previewPage.ts`. `npm test` fails if that constant and the hrefs differ.

**Upload before you push.** This page redeploys on every push to `main`, so the
moment the new hrefs land the buttons are live — pointing them at a DMG that
isn't in the bucket yet breaks every download button on the site. Verify with
`curl -I <url>` and expect a `200`.

## Assets

- `hero-bg.jpg` — Unsplash photo (free to use under the Unsplash license).
- `icon.png` — the app icon, copied from `build/icon-1024.png`.
