# Sketchizi 1.0.24

## Excalidraw baseline

Sketchizi 1.0.24 is released against `@excalidraw/excalidraw` **0.18.1**.

Excalidraw 0.18.1 is a security patch release for the 0.18.x line. It backports
the Mermaid XSS mitigation by updating `@excalidraw/mermaid-to-excalidraw` to
2.2.2 and pins `@types/d3-dispatch` for 0.18.x TypeScript compatibility.

## Sketchizi compatibility

- Existing Excalidraw-powered canvas integration retained.
- Existing `convertToExcalidrawElements()` integration retained.
- Existing local persistence and recent-file storage retained.
- Existing Eraser icon library retained.
- Existing Properties, Layout, Minimap, theme, keyboard shortcut, and PWA features retained.

## Validation

The uploaded source package was statically checked for the Excalidraw dependency
and integration points. A production build could not be executed in the isolated
environment because dependencies were not installed and the package install
timed out before completion.

Before publishing, run:

```bash
npm ci
npm run build
```

Then smoke-test the canvas, `.excalidraw` import/export, persistence, icon drag/drop,
properties panel, minimap, and reset-canvas confirmation.
