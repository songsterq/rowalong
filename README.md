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
   <img width="872" height="932" alt="Screenshot 2026-06-08 at 11 44 02 AM" src="https://github.com/user-attachments/assets/e6fcb549-1193-49a9-94e5-81cad86dba73" />

2. Click **Start**:
   - In Chrome, the overlay pops into a Picture-in-Picture window.
   - In the macOS app, it opens as an always-on-top panel.

   Drag it to your preferred corner; it floats over fullscreen video.
   <img width="767" height="653" alt="overlay" src="https://github.com/user-attachments/assets/8c81e411-903f-4e5e-8985-112c1f6ebd7b" />

3. Click the overlay to pause/resume; hover for previous/next/stop and the density
   toggle.

## Share a workout

Workouts and templates live in the app's local storage, so to give one to a
friend or move it to another computer, export it and import it on the other end.
This works the same way in Chrome and in the macOS app.

**Export.** Click **Export** next to **Save** to share the workout in the builder.
It takes its name from the name field. If that field is empty, it uses the name
of the template you loaded or the workout you generated. To share a template,
built-in or your own, click the export icon on its row in **Templates**. Then
pick one of:

- **Download .json file** saves `<name>.json`.
- **Copy as text** puts the same JSON on the clipboard, ready to paste into a
  message.

**Import.** Click **Import** in the **Build session** header. Paste an exported
workout and click **Load**, or click **Choose file…** and pick a `.json` file.
The workout loads into the builder with its name filled in. Importing saves
nothing on its own: press **Save** to keep it as a template. If the input isn't
a valid workout, the whole import is refused with a message saying why, and the
builder stays as it was.

### Share format

An exported workout is a small JSON document:

```json
{
  "format": "rowalong-workout",
  "version": 1,
  "name": "Quick sprints",
  "segments": [
    { "intensity": "easy", "durationSec": 180, "label": "Warm-up" },
    { "intensity": "hard", "durationSec": 60 },
    { "intensity": "allout", "durationSec": 30 },
    { "intensity": "easy", "durationSec": 120 }
  ]
}
```

| Field | Rule |
| --- | --- |
| `format` | Always `"rowalong-workout"`. |
| `version` | Always `1`. Files with a newer version ask you to update RowAlong. |
| `name` | Text, at most 80 characters. Longer template names are shortened on export. |
| `segments` | 1 to 200 segments, in order. |
| `segments[].intensity` | One of `easy`, `medium`, `hard`, `allout`. |
| `segments[].durationSec` | Seconds, a multiple of 5 from 5 to 3600. |
| `segments[].label` | Optional text. |

The whole input must be under 100 KB. Segments carry no ids, because ids are
local to each install and an import always makes new ones. Fields not listed
above are ignored. Names and labels are untrusted, so the setup page shows them
as plain text, never as HTML.

## Landing page

The marketing site lives in `site/` (static, no build step) and deploys to
Cloudflare Pages; the DMG download is hosted on Cloudflare R2. See
[`site/DEPLOY.md`](site/DEPLOY.md).

## Notes

- Document Picture-in-Picture is Chromium-only — other browsers fall back to an
  in-page overlay. That fallback **cannot** cross into native-app fullscreen
  (browser video only), which is the entire reason the Electron app exists.
