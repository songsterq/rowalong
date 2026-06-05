# Workout Helper

A local web app that runs interval rowing workouts and shows a floating,
always-on-top overlay (intensity, countdown, recommended stroke rate, tone cues)
that rides over any video — including native macOS fullscreen — via Chrome's
Document Picture-in-Picture.

## Develop

```bash
npm install
npm run dev      # open the printed URL in Google Chrome
npm test         # run the unit suite
npm run typecheck
```

## Use

1. Open the app in **Chrome**.
2. Pick a template, or enter total minutes and **Generate** (**Regenerate** for a
   new mix). Optionally edit segments and **Save as template**.
3. Click **Start** — the overlay pops into a Picture-in-Picture window. Drag it to
   your preferred corner; it floats over fullscreen video.
4. Click the overlay to pause/resume; hover for previous/next/stop and the density
   toggle.

## Notes

- Document Picture-in-Picture is Chromium-only. Other browsers fall back to an
  in-page overlay.
- An Electron shell is designed for (see the spec, §2.1) as a drop-in fallback
  behind the same `OverlayHost` interface.
