# UI Modernization Phase 18 — Canvas Navigation

## Scope

Add a discreet **Fit to content** control to Excalidraw's native zoom cluster and improve visibility of native zoom/undo/redo interaction states without replacing native actions.

## Behavior

- Appends the fit control to the native horizontal zoom row (`.zoom-actions > .Stack_horizontal`), next to zoom out, reset zoom, and zoom in.
- Fits all non-deleted scene elements using the viewport API already used by Sketchizi's `F` shortcut, with the legacy `scrollToContent` method as a fallback.
- Disables the new control when the scene is empty or the user is in viewer/read-only mode.
- Adds accessible label and shortcut tooltip, keyboard-focus indication, hover treatment, and reduced-motion support.
- Applies clearer disabled-state styling to existing native zoom, undo, and redo buttons while leaving their handlers and state management intact.

## Verification

- `node --test tests/ui-modernization-*.test.js`: 68 tests passed.
- `npm run test:ui-modernization`: 31 tests passed.
- `npm run build`: blocked in `prebuild` because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent. Run `npm ci` and rebuild in a network-enabled environment.
- Browser visual validation was not performed in this environment.
