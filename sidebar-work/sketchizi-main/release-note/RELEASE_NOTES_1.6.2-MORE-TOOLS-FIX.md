# Sketchizi 1.6.2 — More Tools Fix

## What changed

- Added a reliable Sketchizi-hosted More Tools trigger in the rightmost Excalidraw toolbar slot.
- The trigger anchors to the actual mounted `.App-toolbar` instead of depending on a package-specific extra-tools selector.
- The underlying rightmost grouped-tool button is visually hidden while its layout slot is preserved.
- Added the target More Tools menu with Insert image, Frame tool, Web Embed, Draw to shape, Laser pointer, Bucket fill, Lasso selection, Text to diagram, Mermaid to Excalidraw, and Wireframe to code.
- Menu actions delegate to Excalidraw's imperative API (`setActiveTool` / `updateScene`) rather than reimplementing canvas tools.
- Added post-mount positioning passes and resize/scroll tracking.

## Validation

All project JS/JSX files were parsed successfully with TypeScript's JSX parser using `tsc --noEmit`.
