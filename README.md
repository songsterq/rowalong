# RowAlong

Rowing intervals that ride on top of whatever you're watching.

RowAlong runs interval **rowing** workouts and shows a floating, always-on-top
overlay — intensity, recommended stroke rate, countdown, and tone cues — over any
video. The same overlay UI runs two ways:

- **Browser (Chrome):** the overlay opens in a Document Picture-in-Picture window
  and floats over *browser* video.
- **macOS app (Electron):** a native always-on-top panel that floats over
  *native-app* fullscreen too — Apple TV, QuickTime, and the like — not just
  browser video.

## Download

Grab the macOS app (`.dmg`, Apple Silicon) from
**[rowalong.endlessrainstudio.com](https://rowalong.endlessrainstudio.com/)**. To
build it yourself instead, see [Build the macOS app](#build-the-macos-app) below.

## Develop

```bash
npm install
npm run dev            # browser version — open the printed URL in Google Chrome
npm run electron:dev   # the macOS app — overlay floats over native fullscreen
npm test               # unit suite (Vitest)
npm run typecheck
```

## Build the macOS app

```bash
npm run pack           # build + package a DMG into release/
```

The DMG is ad-hoc signed (no Developer ID), so it launches locally on Apple
Silicon without notarization.

## Use

1. Pick a template, or enter total minutes and **Generate** (**Regenerate** for a
   new mix). Optionally edit segments and **Save as template**.
2. Click **Start**:
   - In Chrome, the overlay pops into a Picture-in-Picture window.
   - In the macOS app, it opens as an always-on-top panel.

   Drag it to your preferred corner; it floats over fullscreen video.
3. Click the overlay to pause/resume; hover for previous/next/stop and the density
   toggle.

## Landing page

The marketing site lives in `site/` (static, no build step) and deploys to
Cloudflare Pages; the DMG download is hosted on Cloudflare R2. See
[`site/DEPLOY.md`](site/DEPLOY.md).

## Notes

- Document Picture-in-Picture is Chromium-only — other browsers fall back to an
  in-page overlay. That fallback **cannot** cross into native-app fullscreen
  (browser video only), which is the entire reason the Electron app exists.
