# Workout Helper — Design

**Date:** 2026-06-05
**Status:** Approved (pending spec review)

## 1. Overview

A local web app that runs interval rowing workouts and shows a **floating,
always-on-top overlay** in a screen corner that rides over anything you are
watching — YouTube / Prime in the browser, or native apps (Netflix, Apple TV,
QuickTime) in fullscreen.

The overlay shows the current intensity (easy / medium / hard / all-out) and a
countdown, plays tone cues at transitions, and is click-to-pause. Workouts are
built either by **auto-generating from a total time** or by **editing and saving
your own templates**.

### Goals

- Glanceable interval guidance overlaid on top of any video, including native
  macOS fullscreen.
- Generate a sensible rowing session from a single input (total time).
- Full manual control: create, edit, and save custom interval templates.
- Audible tone cues so you don't need to watch the corner.
- Pause / resume / skip without aiming a mouse precisely.

### Non-goals (v1)

Voice cues, global hotkeys, menu-bar control, the Electron shell (designed for
but not built), HIIT / non-rowing workout types, and workout history / stats.
These are deferred — see §15.

## 2. Platform decision

The overlay must float over **native macOS fullscreen apps**, not just browser
tabs. A browser extension content script can only draw inside its own page, so a
pure extension is ruled out. The conclusion: this is a **desktop overlay**, but
built almost entirely as platform-agnostic web code, with the platform-specific
part isolated behind one interface (§2.1).

Chosen plan — **"A then B, designed to swap"**: ship the Chrome Document
Picture-in-Picture version first; keep the code shell-agnostic so an Electron
shell is a drop-in fallback if PiP's limits prove unacceptable.

### 2.1 Architecture — the swappable seam

Everything is plain TypeScript web code. The only platform-specific concern —
how the floating window is created — sits behind a single interface.

```
core (framework-agnostic TS)          ui (DOM)              shell seam
├─ types.ts        (Segment, Template) ├─ setup view        OverlayHost (interface)
├─ generator.ts    (time → segments)   ├─ overlay view  ──► ├─ PipOverlayHost     ← v1
├─ sessionEngine.ts (runtime / clock)  └─ shared styles     └─ ElectronOverlayHost ← fallback
├─ audio.ts        (Web Audio tones)
└─ storage.ts      (templates + prefs)
```

`OverlayHost.open()` creates the floating window and returns a `Document` to
render the overlay view into; `OverlayHost.close()` tears it down. The overlay
view and session engine never know which host is in use.

```ts
interface OverlayHost {
  open(size: { width: number; height: number }): Promise<Document>;
  close(): void;
  readonly isOpen: boolean;
  onClosed(cb: () => void): void;   // fires if the user closes the window manually
}
```

- **v1: `PipOverlayHost`** — `documentPictureInPicture.requestWindow(...)`,
  copies stylesheets into the PiP document, returns `pipWindow.document`.
- **Fallback: `ElectronOverlayHost`** — a `BrowserWindow` with
  `setAlwaysOnTop(true, 'screen-saver')` +
  `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`. Implements
  the same interface; the overlay/engine code is untouched.

## 3. Data model (generic, HIIT-ready)

```ts
type Intensity = 'easy' | 'medium' | 'hard' | 'allout';   // → color + default tone

type Segment = {
  id: string;
  intensity: Intensity;
  durationSec: number;
  label?: string;          // optional display override; future HIIT uses it for exercise names
};

type Template = {
  id: string;
  name: string;
  segments: Segment[];     // a saved, editable, ordered sequence
};
```

One core type: an ordered list of segments. Rowing uses the four intensities.
Future HIIT adds per-segment `label`s and new generator types without changing
this model.

## 4. Generator (rowing, v1)

`generate(totalMin: number, options?, seed?) → Segment[]`

Structure:

- **Warmup** — easy, ~15% of total, capped at ~3 min.
- **Middle** — alternating **hard** and **all-out** pushes separated by
  **easy / medium** rests.
- **Cooldown** — easy, ~2–3 min.

Push rules:

- Hard and all-out pushes each range from ~20s up to **150s (2.5 min)**, varied.
- All-out appears **less frequently** than hard.
- Rests run ~1–2× the preceding push; **all-out gets fuller (easy) recovery**,
  hard often gets medium (active) recovery.
- The mix targets a sensible overall work : rest ratio.

Behavior:

- **Seeded random** so **Regenerate** produces variety while remaining
  reproducible from a seed.
- Output is plain `Segment[]`: it can be tweaked in the editor and **saved as a
  template**.
- Very short totals scale down gracefully (shrink, then drop warmup/cooldown
  below a minimum total).

Exact constants are tunable during implementation; the rules above are the
contract.

## 5. Session engine

A framework-agnostic `SessionEngine` class drives a running workout.

- State: `segments`, `currentIndex`, `segmentElapsedSec`, `status`
  (`idle | running | paused | done`).
- **Ticks are derived from a monotonic clock (`performance.now()` deltas)**, not
  from counting `setInterval` fires, so the countdown stays accurate across
  pauses and any background throttling. The clock is injectable for testing.
- Emits state on each tick for the UI to render.
- Fires events: **segment transition** (→ color flash + tone), **3-2-1
  countdown** into the next segment, and **completion**.
- Commands: `start`, `pause`, `resume`, `skipNext`, `skipPrev`, `stop`.

## 6. Audio cues

`audio.ts` synthesizes tones with Web Audio oscillators — no asset files.

- Short **3-2-1 beeps** before a push begins.
- A distinct **rising / urgent** tone entering hard or all-out.
- A softer **descending** tone entering easy / medium (ease-up).
- A final tone at session end.
- Volume and mute, persisted.
- The `AudioContext` is created / resumed on the **Start** click, satisfying
  browser autoplay rules.

Voice cues are deferred but slot in here later.

## 7. Overlay view (the floating widget)

Renders engine state into the `Document` provided by `OverlayHost`. Two density
modes with a **toggle** (preference persisted):

- **Minimal pill** — intensity word, big countdown, segment progress bar.
- **Coach card** — adds "next up", session progress, and block count, with
  always-visible controls.

Shared behavior:

- Color-coded intensities: easy = green, medium = amber, hard = orange,
  all-out = red.
- Countdown **emphasized** (size + color) during hard / all-out; calmer during
  easy / medium rests.
- Color **flash + tone** on transitions.
- **Click the body = pause / resume.** Hover reveals: ⏸/▶ · ⏭ · ⏮ · ⏹ ·
  density-toggle.
- Paused state: dimmed with a "PAUSED" tag.

PiP does not expose precise screen positioning, so the user drags the window to
their preferred corner; the app does not fight it.

## 8. Setup view (main page)

- Template list including 1–2 built-in starters.
- Either pick a template, **or** enter total minutes and **Generate**
  (with **Regenerate** for a new mix).
- Optional edit in a simple segment editor: add / remove / reorder segments, set
  intensity and duration.
- **Save as template** / **Start**.
- Preferences: default density, volume / mute.

**Start** is the user gesture that opens the overlay, starts the engine, and
unlocks audio.

## 9. Persistence

Templates and preferences live in `localStorage` behind a thin `storage.ts`
wrapper, so the backing store can become a file or `electron-store` later
without touching callers. Small data; no backend.

## 10. Flow

1. Launch the app → setup view.
2. Choose a template, or enter total time and Generate; optionally edit.
3. **Start** → PiP overlay opens and floats over your video; engine starts;
   audio unlocks.
4. During the session: countdown + tones guide you; click to pause / resume,
   hover to skip / stop, toggle density.
5. On finish, the overlay shows "done" and focus returns to setup.

## 11. Edge cases

- **Non-Chrome** (no `documentPictureInPicture`): detect and show a clear
  message plus an in-page fallback overlay.
- **User closes the PiP window mid-session**: `onClosed` fires → engine pauses
  and offers to reopen.
- **Total time too short**: generator clamps / drops warmup-cooldown.
- **Audio blocked**: tied to the Start gesture, so it is unlocked before play.
- **No templates yet**: ship built-in starters.

## 12. Testing

Unit tests cover the pure logic:

- **generator** — valid sequence; respects total within tolerance; includes
  warmup, cooldown, at least one hard and one all-out; pushes within the 20–150s
  bound; sane work : rest ratio; deterministic for a given seed.
- **sessionEngine** — transitions, pause / resume accuracy via an injected
  clock, skip next / prev, completion.
- **storage** — save / load / delete templates and prefs.

`audio.ts` and the overlay hosts are thin browser-API wrappers, kept dumb and
verified manually. A manual end-to-end checklist covers: overlay over fullscreen
Netflix.app and YouTube fullscreen, pause / resume, audible tones, density
toggle.

## 13. Build / stack

**Vite + TypeScript, vanilla DOM** — matches the `yt-focus` style and keeps
dependencies minimal. Not WXT: this is a web app, not a browser extension.

## 14. First step / key risk

**Step 0 spike:** confirm a *Document* PiP window floats over a *native macOS
fullscreen* app (Netflix.app / Apple TV). Video PiP does; Document PiP almost
certainly does — but it is the one load-bearing assumption, so retire it before
building the rest. If it fails, go straight to the `ElectronOverlayHost` (same
UI and engine).

## 15. v1 scope vs. deferred

**In scope:** generic interval engine, rowing generator (pushes up to 2.5 min),
template editor with save / load, PiP overlay with density toggle, tone cues,
click-to-pause plus skip / stop.

**Deferred:** voice cues, global hotkey, menu-bar control, Electron shell
(behind the seam, ready when needed), HIIT and other workout types, workout
history / stats.
