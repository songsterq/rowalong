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

Workouts and templates live in one machine's local storage. To give a workout to
a friend or move it to another computer, export it as a small JSON file or as
text, and import it on the other side. Chrome and the macOS app work the same way.

**Export.** Click **Export** next to **Save** to share the workout in the builder,
or the export icon on any row of the Templates list (the built-in starters
included). Then pick:

- **Download .json** saves `<name>.json`. In the macOS app a Save panel opens
  first.
- **Copy as text** puts the same JSON on the clipboard, ready to paste into a
  message.

The builder's workout takes its name from the name field. If that is empty, it
uses the template or generated workout it came from. RowAlong won't export a
workout it couldn't import again, such as one with a 7-second block. Instead it
says what's wrong.

**Import.** Open **Import a workout** under the builder. Either paste the text
and click **Import pasted text**, or click **Choose file…** and pick a `.json`
file. The workout replaces what's in the builder and its name fills the name
field. Nothing is saved: click **Save** to keep it as a template. If the input
isn't a valid workout, a message says why and the builder stays as it was.

### The share format

A shared workout is a JSON object, version 1:

```json
{
  "format": "rowalong-workout",
  "version": 1,
  "name": "Two sprints",
  "segments": [
    { "intensity": "easy", "durationSec": 120 },
    { "intensity": "allout", "durationSec": 30, "label": "Sprint 1" },
    { "intensity": "easy", "durationSec": 60 },
    { "intensity": "allout", "durationSec": 30, "label": "Sprint 2" },
    { "intensity": "easy", "durationSec": 180 }
  ]
}
```

| Field | Rule |
| --- | --- |
| `format` | Always `"rowalong-workout"`. |
| `version` | `1`, the only version this release reads. A file from a newer RowAlong is refused with a message naming its version. |
| `name` | Text, at most 80 characters. If it's empty, the workout runs as "Imported workout". |
| `segments` | 1 to 200 segments, run in order. |
| `segments[].intensity` | `"easy"`, `"medium"`, `"hard"` or `"allout"`. |
| `segments[].durationSec` | Whole seconds: a multiple of 5, from 5 to 3600 (an hour). |
| `segments[].label` | Optional text. |

The whole input must be under 100 KB. Segments carry no ids, because ids only
mean something in one machine's storage. Each imported segment gets a new one.
Any field not in the table is ignored.

Import is all or nothing. If one field breaks a rule, the whole input is refused
and nothing changes. The message says what's wrong, and which segment if the
problem is in one. Names and labels from a file are always shown as plain text,
never as HTML.

The codec is `src/core/shareFormat.ts` (`exportWorkout` / `parseWorkout`), and
its limits are `SHARE_LIMITS`.

## Landing page

The marketing site lives in `site/` (static, no build step) and deploys to
Cloudflare Pages; the DMG download is hosted on Cloudflare R2. See
[`site/DEPLOY.md`](site/DEPLOY.md).

## Notes

- Document Picture-in-Picture is Chromium-only — other browsers fall back to an
  in-page overlay. That fallback **cannot** cross into native-app fullscreen
  (browser video only), which is the entire reason the Electron app exists.
