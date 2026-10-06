# Sketchizi 1.10.3 — Layout Button Direct Event Fix

## Root cause

The visible Layout control is a DOM button injected into Excalidraw’s native menu by `useNativeSketchiziMenu`. The Layout click was being handled only through a document-level delegated `click` listener. That made the control dependent on Excalidraw/native-menu event propagation.

The keyboard shortcut did not use that path: it directly calls the existing `togglePanel("layout")` action.

## Fix

The Layout button now receives its own direct DOM `click` listener when the button is created/found. The listener calls the exact same `togglePanel` function used by the keyboard shortcut, with `"layout"` as its panel argument. The document-level delegated handler no longer handles Layout clicks.

No new Layout state was introduced. The existing `activePanel` / `layoutOpen` state remains the single source of truth.

## Scope

No Layout panel positioning, portal mounting, responsive CSS, collaboration, viewer permissions, file management, undo/redo, or canvas behavior was changed.

## Validation

Static source validation was performed. Runtime browser interaction and `npm run build` remain UNVERIFIED in the current environment because the project dependencies could not be installed: npm reported an uncached `@excalidraw/excalidraw` package in offline mode, and the online `npm install` attempt timed out.
