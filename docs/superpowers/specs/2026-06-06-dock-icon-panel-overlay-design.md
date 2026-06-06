# Dock Icon + Panel Overlay — Design

**Date:** 2026-06-06
**Status:** Approved (pending spec review)
**Area:** Electron main process (`electron/app.cjs`)

## Summary

Give RowAlong a normal macOS **Dock icon** (Regular app: ⌘-Tab presence, ⌘-Q,
stays alive when the setup window closes) **without** losing the overlay's
ability to float over another app's native fullscreen (Apple TV / Netflix /
QuickTime).

The mechanism: make the overlay window a **non-activating `NSPanel`** via
Electron's `new BrowserWindow({ type: 'panel' })`. A panel floats over other
apps' fullscreen spaces independent of the host app's Dock/accessory status, so
we can stop running as a dock-less accessory and run as a normal Dock app.

## Background — why the prior attempt failed

The current code runs the whole app as a **dock-less accessory** (`app.dock.hide()`)
because, as a normal foreground (Regular) app, the overlay's
`setVisibleOnAllWorkspaces({ visibleOnFullScreen: true })` floats over nothing.

The earlier Dock-icon attempt (`992f4f6`, reverted in `70b82f3`) kept the app
Regular and leaned on Electron's **activation-policy transform** (omitting
`skipTransformProcessType`, which briefly flips Regular→Accessory→Regular) to
enable the float. In practice that **did not** float over Apple TV, and added a
one-time flicker. AGENTS.md records the conclusion: the real path to a Dock icon
is a native **non-activating NSPanel**.

This design is that path — but using the panel primitive Electron now exposes
directly (`type: 'panel'`, added ~Electron 25; this project is on **42.3.3**), so
no native code is required. It is a *different mechanism* from the failed
activation-policy transform, which is why a different outcome is expected.

## Approach

Single Regular Dock app. The on-demand overlay `BrowserWindow` is created as a
panel; the float flags are unchanged from today's working accessory recipe.

### Changes to `electron/app.cjs`

1. **Overlay window → panel.** Add `type: 'panel'` to the overlay
   `new BrowserWindow({ … })` options. Everything else about the overlay window
   stays the same (frameless, transparent, no shadow, always-on-top, etc.).

2. **Drop accessory mode.** Remove `if (app.dock) app.dock.hide();` from
   `app.whenReady()`. The app now runs Regular and shows a Dock icon. Keep
   `nativeTheme.themeSource = 'dark'`.

3. **Standard macOS lifecycle.** Change `window-all-closed` from an unconditional
   `app.quit()` to `if (process.platform !== 'darwin') app.quit();` so the Dock
   app stays alive when its windows close. The existing `activate` handler
   (reopen the setup window if none) already gives the correct dock-click /
   ⌘-Tab reactivation.

4. **⌘-Q / app menu.** No code needed — a Regular Electron app gets the default
   application menu (with Quit / ⌘-Q) automatically. (We do **not** add a custom
   menu in this change.)

### What stays exactly the same

- `setAlwaysOnTop(true, 'screen-saver')`.
- `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })`
  — **keep** `skipTransformProcessType: true`. We do **not** want the
  activation-policy transform (that's the thing that failed and flickered); the
  panel handles the float.
- `showInactive()` to avoid stealing focus. (A non-activating panel won't steal
  focus on click anyway — a small bonus, not a behavior we rely on.)
- Bounds persistence, `move-overlay-by`, `set-overlay-height` height-hug, the
  setup window, all IPC.

## Risks & fallback

- **Empirical risk (primary).** Whether a Regular-app panel floats over Apple
  TV's fullscreen can only be confirmed on the user's Mac. If it does **not**,
  the fallback is Approach B from brainstorming: keep the Regular Dock app for the
  setup window and run the **overlay in a separate accessory (dock-less) helper
  process** (the proven recipe) with IPC between them. That is a much larger
  change and out of scope for this spec — it would get its own spec only if A
  fails.
- **NSPanel quirks.** Non-activating panels can have focus/keyboard edge cases.
  The overlay is click/drag-only (no text input), so this is low risk.

## Testing

- **Unit:** no core/logic change. `npm test` (incl. `windowBounds` tests) must
  stay green; `npm run typecheck` clean. These are the only automatable checks —
  the float behavior has no unit coverage (it never has; it's a manual recipe).
- **Manual (the real validation — user-run on macOS):** `npm run electron:dev`,
  then with Apple TV.app (or another app) in **native fullscreen**, start a
  workout and confirm all of:
  1. A **Dock icon** is present.
  2. **⌘-Q** quits the app.
  3. The **overlay floats over** the fullscreen video (the whole point).
  4. Closing the setup window leaves the app running; clicking the Dock icon /
     ⌘-Tab **reopens** the setup window.
  5. Overlay still drags, resizes, hugs its height, and click-to-pause works.

## Out of scope

- The two-process accessory-helper fallback (Approach B) — only if A fails.
- A custom application menu / custom Dock icon artwork.
- Any change to the browser (Document PiP) path or the core/UI code.

## Docs to update on success

- `AGENTS.md` "macOS over-fullscreen needs an accessory app" gotcha and the spec
  §16 reference — replace the "intentionally no Dock icon" conclusion with the
  panel approach (keep the history note about why the activation-policy transform
  failed).
