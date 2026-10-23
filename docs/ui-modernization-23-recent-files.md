# UI Modernization 23 — Recent Files

## Goal

Make Recent files more informative and more helpful when a saved file or browser-local snapshot is no longer accessible, without replacing the existing native-menu integration or file manager.

## Changes

- Show a compact format label for `.sketchizi`, `.excalidraw`, JSON, and local drawings.
- Distinguish a linked file handle from a browser-local drawing snapshot.
- Track `lastOpenedAt` separately from the existing `savedAt`/recent-order timestamp. Legacy entries continue to render using their saved/added timestamp.
- Show relative last-opened/added information with full detail available in the row tooltip.
- Preserve unavailable entries in Recent files when a handle or local snapshot cannot be found. They are marked **Unavailable** rather than silently removed, and can be retried or removed by the user.
- Preserve entries when access is denied and show **Permission needed**. Selecting the entry retries the normal permission path.
- Clear availability warnings when a recent file is opened successfully.
- Render metadata as accessible text, escape user-provided names and IDs before inserting the native-menu HTML, and adapt the metadata layout on narrow viewports and dark theme.

## Verification

Run `npm run test:ui-modernization`. `tests/ui-modernization-recent-files.test.js` covers format/origin labels, time labels, missing and permission status messages, accessible list markup, persistence of status/last-opened metadata, and test-suite registration.

A production build and live-browser visual inspection must still be done in an environment with dependencies installed. The local build preflight fails when `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is missing; run `npm ci` before build verification.
