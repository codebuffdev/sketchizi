# UI Modernization Phase 21 — Save Status and Recovery

## Scope

Add an explicit local-autosave status to the application header and expose the existing local save and portable-recovery operations in one compact panel. This phase does not introduce a second persistence store or claim cloud backup behavior.

## Behavior

- The status reflects `restoring`, `ready`, `pending`, `saving`, `saved`, and `error` states from `useSketchPersistence`.
- A queued change becomes pending immediately; the save timer and IndexedDB write drive the saving and saved states.
- Save revisions prevent an older, slower write from marking a newer change as saved. A failure from a stale revision does not override the visible state of a newer queued save.
- The panel reports the last successful local save when available, explains that autosave is browser/device-local, and exposes **Save now** plus **Download recovery backup**.
- If IndexedDB restoration or saving fails, the existing warning banner remains the primary alert. Emergency-backup availability is also described in the status panel.
- The recovery export uses the current canvas and existing `serializeDrawing` format path; no new export format is added.
- Styling supports the existing light/dark theme, keyboard focus, reduced motion, and narrow desktop widths. The header status indicator is intentionally hidden on tablet/phone widths where the header has limited room; the existing storage warning still exposes recovery actions when saving fails.

## Verification

- `npm run test:ui-modernization`: source-contract suite passed.
- Production build was attempted but is blocked in this environment because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent and `node_modules` is not installed. Install dependencies with `npm ci` before build/browser verification.
- No live-browser screenshot has been captured for this phase; visual placement and popover behavior must still be checked in a running app.
