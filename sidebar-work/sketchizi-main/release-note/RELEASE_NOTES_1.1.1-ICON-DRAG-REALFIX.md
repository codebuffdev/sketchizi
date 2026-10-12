# Sketchizi 1.1.1 — Icon drag real fix

This release preserves the known-working 1.0.x Library → Canvas insertion implementation and adds a dedicated desktop mouse drag fallback.

## Drag path

- Icon cards remain `draggable={false}` so browser native HTML5 drag does not compete with Sketchizi's custom gesture.
- Desktop mouse drag uses `mousedown` + document-level `mousemove`/`mouseup` capture.
- The original pointer-event path remains available for touch/pen input, but explicitly ignores mouse pointers so the two desktop gesture systems cannot race each other.
- On release inside the Excalidraw canvas, the icon is inserted at the release coordinates.
- A drag suppresses the following click so drag does not also trigger click-to-place.
- The service-worker cache name is bumped to `sketchizi-v1.1.1` to avoid serving an older cached bundle.

## Validation

- All JavaScript and JSX source files pass a TypeScript parser/transpile syntax check.
- ZIP archive generated from a fresh release directory.
- Full npm/Vite build could not be executed in the build environment because the npm cache is missing a required package tarball (`zustand-4.5.7.tgz`) and registry access is unavailable.
