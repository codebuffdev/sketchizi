# Sketchizi 1.10.2 — Layout Button Toggle Fix

## Root cause

The native Sketchizi Layout button was handled by two separate click paths in `useNativeSketchiziMenu`: a document-level capture listener and a direct button listener. Both invoked `openLayout()`, which could only open the panel and could not represent the required toggle behavior.

The working keyboard shortcut already used `togglePanel("layout")`, so the mouse path was not using the same state transition.

## Fix

- `src/features/navigation/useNativeSketchiziMenu.js` now routes the Layout button through a single capture-phase click path that calls `toggleLayout()`.
- The redundant direct Layout-button listener was removed.
- `src/App.jsx` passes `togglePanel("layout")` as `toggleLayout`.
- The existing `layoutOpen` state remains the only source of truth.

No Layout panel positioning, portal mounting, responsive CSS, collaboration, viewer permissions, undo/redo, file management, or canvas behavior was changed by this fix.

## Validation

Static source validation was performed. Browser/runtime and `npm run build` validation could not be completed in this environment because the project dependencies are not installed and the dependency installation attempt timed out.
