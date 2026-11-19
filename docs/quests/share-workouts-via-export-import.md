# Share workouts via export/import

A quest for songsterq/rowalong, approved by Song Qian on 2026-11-19. Its tasks are tracked in Minira.

## Why

Workouts and templates only live in one machine's localStorage, so people can't hand a good workout to a friend or move it to another computer.

## What

From the setup page, export the workout in the builder or any template (built-in starters included) as a versioned JSON payload {format:'rowalong-workout', version:1, name, segments}. The payload can be downloaded as a .json file or copied as text. Import takes a chosen file or pasted text, validates it strictly, and loads it into the builder with its name prefilled; the user saves it as a template with the existing Save button if they want. Electron uses the same web APIs as the browser.

## Done when

- [ ] Exporting the builder workout or any template produces a versioned rowalong-workout JSON payload, both as a downloaded .json file and as copied text, containing its name and segments.
- [ ] Importing an exported workout, from a file or pasted text, loads identical segments (fresh ids) and its name into the builder, without writing anything to storage.
- [ ] Invalid, corrupt, wrong-version or out-of-bounds input is rejected as a whole with a clear message and changes nothing. Out of bounds means: a duration that isn't a multiple of 5 s in 5 to 3600 s, other than 1 to 200 segments, a name over 80 chars, or input of 100 KB or more. Unit tests cover the codec's round-trip and rejection cases.
- [ ] An imported name or label containing HTML is shown as plain text in the builder and the Templates list, never as markup.
- [ ] Export (file and copy) and import (file and paste) work on the setup page in both Chrome and the Electron app.

## Out of scope

- Exporting or importing several workouts at once, or a whole template library.
- Share links, URL-encoded or base64 share codes, and any cloud or server sync.
- Sharing session history or preferences.
- Native save/open dialogs over Electron IPC, unless the web APIs turn out to fail there.

## Decisions

- **Imported names are untrusted. The Templates list renders t.name through innerHTML without escaping (src/ui/setupView.ts renderTemplates). Should it be escaped?** Yes: escape names (and labels) wherever they are rendered, so a crafted file can't inject markup into the setup page. _(assumed by Claude)_
- **How is a workout shared?** both, same payload _(recommended by Claude, accepted)_
- **What can be exported?** both, including the built-in starters _(recommended by Claude, accepted)_
- **What does Import do?** load it into the builder, name prefilled, user saves it if they want _(recommended by Claude, accepted)_
- **What format is the payload?** versioned JSON: {format:'rowalong-workout', version:1, name, segments:[{intensity, durationSec, label?}]} _(recommended by Claude, accepted)_
- **How strict is validation on import?** reject the whole import on any bad field, with a message _(recommended by Claude, accepted)_
- **In Electron, use plain web APIs (download link, file input, navigator.clipboard) instead of new IPC/native dialogs?** yes, web APIs only; add IPC only if something fails in Electron _(recommended by Claude, accepted)_
- **Use the earlier spec for this goal (commit 61878ce, no longer on main) as the starting point?** yes, reuse its done-when checks where they fit these decisions _(recommended by Claude, accepted)_

## Plan

1. **ROW-1 Add workout share format codec**. Add a pure core module, src/core/shareFormat.ts, with exportWorkout(name, segments) and parseWorkout(text). The payload is {format:'rowalong-workout', version:1, name, segments:[{intensity, durationSec, label?}]}, with no ids. parseWorkout returns either a workout with fresh segment ids or a clear error. It rejects the whole input if it isn't JSON, has the wrong format or version, has an unknown intensity, has a duration that isn't a multiple of 5 s in 5 to 3600 s, has other than 1 to 200 segments, has a name over 80 chars, or is 100 KB or more. Build test-first, with round-trip and bad-input tests.
2. **ROW-2 Escape template names on the setup page**. Move the escapeHtml helper from historyPanel.ts into src/ui/format.ts and share it. Use it in setupView renderTemplates for the template name and data-id, which are currently put into innerHTML raw. Check that the overlay shows segment labels only through textContent. Add a test that a name containing HTML renders as text.
3. **ROW-3 Add Export to the setup page** (after ROW-1). Add an Export control next to Save for the workout in the builder (named from the name field, falling back to its program name) and an export icon on each Templates row, starters included. Each one downloads <name>.json through a Blob and an <a download> link, and can copy the same text with navigator.clipboard. Show a brief confirmation, and a message if copying fails.
4. **ROW-4 Add Import to the setup page** (after ROW-1, ROW-2). Add an Import control that takes a chosen .json file (a file input) or pasted text. It runs parseWorkout, then loads the result into the builder with the name field and program name filled in. Nothing is saved. Invalid input shows parseWorkout's message inline and leaves the builder as it was. The segment editor currently drops segment labels (rowHtml and readEditor don't carry them), so keep the label on the row so an import, then a re-export, round-trips. Add tests.
5. **ROW-5 Verify export/import in the Electron app** (after ROW-3, ROW-4). Run npm run electron:dev and check file download (the save dialog), copy, file import (the open dialog) and paste in the setup window. Fix any gaps there, adding preload/main IPC only if a web API actually fails. Record the result in the PR.
6. **ROW-6 Document the share format** (after ROW-5). Describe the share format and how to export and import a workout in the README. Add shareFormat.ts to the src/core list in AGENTS.md, noting that its validation caps follow the 5-second-unit convention.

