# Sketchizi 1.6.2 — Icon insertion fix

## Fixes

- Migrated Excalidraw `updateScene()` calls from the removed `commitToHistory` option to the current `captureUpdate` API.
- Removed the document `mouseleave` drag termination that could cancel a mouse drag prematurely.
- Added window-blur and released-button cancellation for abandoned mouse drags.
- Drag/pointer insertion now uses exact release coordinates without click-style overlap avoidance.
- Newly inserted image icons are selected immediately.
- Touch/pen insertion now requires the release point to be inside the Excalidraw canvas.

## Scope

No new dependencies were added and no unrelated icon-library or canvas architecture changes were made.

## Validation

Static source inspection was performed. A full Vite build/runtime test could not be performed in the sandbox because the project does not contain `node_modules` and the sandbox has no package-registry access.
