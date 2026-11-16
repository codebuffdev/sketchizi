# Sketchizi 1.10.78 — New text font default fix

## Root cause

Excalidraw 0.18 updates `appState.currentItemFontFamily` while the font picker is still open. The prior Sketchizi detection waited for the popup to close *and* the family to change in the same callback. Because Sketchizi observed and saved the already-updated app state while the popup remained open, the subsequent close callback saw no new family change; its reconciliation could then restore the old default. Sketchizi also omitted `currentItemFontFamily` from IndexedDB and `.excalidraw` app-state serialization, and a grid-sync update spread a possibly stale full app-state snapshot.

## Changes

- Capture a font choice as soon as `currentItemFontFamily` changes while the Excalidraw font picker is or was open.
- Keep a selected default font as app-state preference for subsequent text creation; selecting a text element alone does not change that preference.
- Use a partial grid app-state update so it cannot overwrite the font preference.
- Queue local persistence after font preference reconciliation and persist `currentItemFontFamily` in local/recent sketches and `.excalidraw` files.
- Restore the saved preference on initial canvas hydration, falling back to Excalifont for invalid/older records.
- Bump the frontend/service-worker version to 1.10.78.

## Verification

- Targeted tests: 42 passed, 0 failed.
- JavaScript syntax checks for modified `.js` modules and tests passed; `package.json` and `package-lock.json` parse as JSON.
- Production build not verified: Vite's pinned Excalidraw fonts are missing because `npm ci` has not successfully completed in this environment. Run `npm ci` then `npm run build` before deploying.
- Actual browser verification of choosing a font then creating a second text element remains pending.
