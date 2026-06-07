# RowAlong landing page — design

**Date:** 2026-06-06
**Status:** approved

## Goal

A single static landing page for RowAlong, hosted on Cloudflare Pages, with a
download button for the macOS app. Highlight the app's real features without
over-selling. Mirror the app's color scheme.

## Constraints & decisions

- **Download host: Cloudflare R2.** The DMG is ~118 MB; Cloudflare Pages caps
  individual files at 25 MiB, so the binary cannot be served from Pages itself.
  The download button points to an R2 public URL. The URL lives in a single,
  clearly-marked place (HTML comment) for one-line editing; a labeled placeholder
  is used until the real bucket URL is known.
- **Page location: standalone `site/` folder.** Self-contained static files, no
  build step, fully decoupled from the Vite app build. Cloudflare Pages serves
  `site/` directly (output dir = `site/`, no build command).
- **Platform honesty:** the build is macOS Apple Silicon (arm64) only and is
  ad-hoc signed. The page states `macOS · Apple Silicon` under the button and a
  short note that first launch needs right-click → Open (Gatekeeper).

## Files

- `site/index.html` — the page (semantic HTML).
- `site/styles.css` — styles.
- `site/icon.png` — copy of `build/icon-1024.png` (hero logo + favicon).
- `site/DEPLOY.md` — Cloudflare Pages deploy note (output dir `site/`, no build
  command) and where to set the R2 download URL.

## Visual direction

Mirror the app: near-black background (~`#0e0e10`), white text with a muted-grey
secondary, system font stack. The app's four intensity colors used sparingly as
accents:

- easy `#34d399` (green) · medium `#fbbf24` (amber) · hard `#ff8c42` (orange) ·
  all-out `#ff4d4f` (red)

Used as a thin gradient hairline, small accent dots, and a faithful CSS
re-creation of the overlay card in the hero. No superlatives in copy.

## Page structure (single page)

1. **Hero** — app icon, "RowAlong", the real tagline ("Rowing intervals that ride
   on top of whatever you're watching"), a primary **Download** button with a
   `macOS · Apple Silicon` subline. Beside it, a CSS re-creation of the overlay
   card (intensity label, recommended spm, countdown, stroke-pace bar) floating
   over a faux video frame, to show what the app is at a glance.
2. **Features** (~4–5 short, honest cards):
   - Floats over anything — browser video **and** native macOS fullscreen (the
     real differentiator).
   - Generated interval workouts — warm-up → pushes → cool-down, 10/20/30 min,
     push strategies, save your own templates.
   - Stroke-rate coaching — recommended spm, a live drive/recovery pace bar, and
     tone cues.
   - Stays out of the way — minimal pill or coach density; click to pause, drag
     anywhere.
   - Local & private — runs on your machine, no account, no tracking.
3. **How it works** — 3 steps: Build a session → Start → It rides over your show.
4. **Install note** — first launch is right-click → Open (ad-hoc signed).
5. **Footer** — Endless Rain Studio · v1.0.0.

## Out of scope

- Hosting/serving the DMG itself (lives in R2, set up separately).
- Windows/Intel builds (the shipped artifact is arm64 macOS only).
- Analytics, newsletter signup, multi-page content.
