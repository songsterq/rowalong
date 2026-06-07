# Deploying the RowAlong landing page

This `site/` folder is a self-contained static site. No build step.

## Cloudflare Pages

1. Push the repo to GitHub (already on `github.com:songsterq/workout-helper`).
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**, pick this repo.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `site`
4. Deploy. Cloudflare serves `site/index.html` at the project URL.

> Cloudflare Pages caps individual files at 25 MiB. The DMG is ~118 MB, so it is
> **not** part of this folder. It lives in Cloudflare R2 (see below).

## The download button

The DMG is hosted in **Cloudflare R2**, not on Pages. The button points at the
R2 public URL.

1. Create an R2 bucket and upload `release/RowAlong-1.0.0-arm64.dmg`.
2. Enable public access (an `https://pub-<hash>.r2.dev` URL, or attach a custom
   domain like `https://dl.rowalong.app`).
3. In `index.html`, replace every `DOWNLOAD-URL` placeholder href
   (`https://REPLACE-WITH-YOUR-R2-PUBLIC-HOST/RowAlong-1.0.0-arm64.dmg`) with the
   real public URL. There are three: the header, the hero, and the closing band.

To bump the version later, re-upload the new DMG and update the filename/version
strings in `index.html` (`v1.0.0` appears in the meta line and footer).

## Assets

- `hero-bg.jpg` — Unsplash photo (free to use under the Unsplash license).
- `icon.png` — the app icon, copied from `build/icon-1024.png`.
