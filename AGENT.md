# Udemy Transcript Helper – Agent Notes

## Purpose
- Browser extension (Manifest V3) that injects a content script into Udemy pages.
- Current focus is extracting transcript entries so they can be consumed by other tooling for learning workflows.

## Repo Structure
- `manifest.json` – Chrome extension manifest; loads `content-script.js` on Udemy pages.
- `background.js` – Service worker that listens for the browser action click and pings the content script to surface the helper UI.
- `content-script.js` – Self-invoking module that exposes `window.udemyTranscriptHelper` with helper functions:
  - `extractTranscript()` → `{ panelFound, lineCount, items[] }`.
  - `findTranscriptPanel()` → DOM node or `null`.
  - `findTranscriptLines(panel)` → array of DOM nodes.
  - `findTranscriptToggle()` → transcript button element.
  - `findCurriculumItems()` → array of `{ element, title, index, type, isVideo }` for the lesson list; only items with a video icon are selectable.
  - `ensureTranscriptPanelOpen()` / `closeTranscriptPanel()` → toggle the transcript sidebar as automation runs each lecture.
  - `exportSelectionToText(selection?)` → gathers transcripts for the chosen lectures, formats plain text, and triggers a `.txt` download.
  - `showSelectionPanel()` → renders the in-page checklist UI so the user can pick any video lectures to export.

## Development Workflow
1. Edit scripts directly; no build step yet.
2. When adding new selectors or logic, keep them inside the constants at the top of `content-script.js`.
3. Use succinct comments only when behavior is non-obvious (per repo instructions).
4. After edits, load the extension via `chrome://extensions` (Developer Mode → Load unpacked → repo root).
5. Validate on a Udemy course page via DevTools console:
   ```js
   window.udemyTranscriptHelper.extractTranscript();
   ```
6. Activation:
   - Click the extension icon (or wait ~7 s after page load) to surface the floating “Transcript Helper” panel. The icon triggers `showSelectionPanel()` via the background service worker.
   - Watches the DOM (mutation observer + polling) until the curriculum list appears.
   - Renders a floating “Transcript Helper” checklist that lists only the playable video lectures (identified via the `#icon-video` SVG). The user can select/deselect any combination, then press “Export selected to TXT” to drive automation.
   - During export the agent clicks each selected video in order, opens the transcript toggle, copies all transcript lines, closes the transcript sidebar, and repeats until finished. A text file named `udemy-transcripts-<timestamp>.txt` downloads when complete (grouped by lecture with timestamps inline).
   Check DevTools console for helper logs if nothing appears; the helper reports when it cannot find the panel/list within 15 s and whether export succeeded.
7. To trigger the panel or exports manually:
   ```js
   await window.udemyTranscriptHelper.showSelectionPanel(); // re-render checklist (videos only)
   await window.udemyTranscriptHelper.exportSelectionToText(); // re-use last selection from the UI
   ```
   This follows the user’s flow: (1) find the curriculum list (`examplelist.html`), (2) locate the transcript toggle (`exampleall.html`), (3) read transcript cues once the panel is open.

## Future Workplace Hooks
- The user will later provide specific DOM selectors for transcript controls. Add them to the selector lists rather than hard-coding new queries.
- Consider wiring a messaging bridge (e.g., via `chrome.runtime.sendMessage`) once background or popup scripts exist.
- If build tooling becomes necessary, keep raw sources under `src/` and update `manifest.json` paths accordingly.
- When automating navigation through lessons, reuse `showSelectionPanel()` / `findCurriculumItems()` so the agent can honor whatever combination of video lectures the user selects before export. The UI’s “Select all” button now toggles between “Select all” and “Deselect all” as the selection changes, so automation should not assume the button label is static. Final transcript exports are plain-text and grouped per video; adjust `buildTranscriptText` if a different format is needed.
