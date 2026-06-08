# Deploying the RowAlong landing page

This `site/` folder is a self-contained static site. No build step.

## Cloudflare Workers (static assets)

Deployment is driven by **`/wrangler.jsonc` at the repo root** (not in this
folder). It declares an assets-only Worker that serves `site/`:

```jsonc
{ "name": "rowalong", "assets": { "directory": "./site" } }
```

On every push to GitHub (`github.com:songsterq/rowalong`), Cloudflare's
Workers Build runs `wrangler deploy` from the repo root, finds that config, and
uploads `site/` — `site/index.html` is served at the project URL. `site/_headers`
is honored.

> **Why the config lives at the root, not here:** wrangler only looks for its
> config in the working directory it runs from (the repo root), never in
> subdirectories. A `wrangler.jsonc` inside `site/` is ignored, and with no root
> config wrangler tries to auto-configure the root `vite.config.ts` (the Electron
> app) and fails. Keep the deploy config at the root.

> Cloudflare static assets cap individual files at 25 MiB. The DMG is ~118 MB, so
> it is **not** part of this folder. It lives in Cloudflare R2 (see below).

## The download button

The DMG is hosted in **Cloudflare R2**, not on Pages. The three `DOWNLOAD-URL`
hrefs in `index.html` (header, hero, closing band) currently point at:

```
https://rowalongcdn.endlessrainstudio.com/release/RowAlong-1.0.0-arm64.dmg
```

To set up or move it:

1. Upload `release/RowAlong-1.0.0-arm64.dmg` to the R2 bucket behind that host.
2. Make sure the object is publicly readable at the URL above.
3. If the host or path changes, update every `DOWNLOAD-URL` href in `index.html`
   (search for `DOWNLOAD-URL`; there are three).

To bump the version later, re-upload the new DMG and update the filename/version
strings in `index.html` (`v1.0.0` appears in the meta line and footer).

## Assets

- `hero-bg.jpg` — Unsplash photo (free to use under the Unsplash license).
- `icon.png` — the app icon, copied from `build/icon-1024.png`.
