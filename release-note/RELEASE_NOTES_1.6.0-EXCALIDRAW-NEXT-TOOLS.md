# Sketchizi 1.6.0 — Excalidraw More Tools

## What changed

Sketchizi now uses the Excalidraw `next` channel so the embedded editor can expose the newer tool-registry toolbar and **More tools** menu shown in current Excalidraw builds.

The embedded Excalidraw instance keeps `aiEnabled={true}` so the Generate section can surface when supported by the installed Excalidraw build.

## Expected More Tools menu

- Insert image
- Frame tool
- Web Embed
- Draw to shape
- Laser pointer
- Bucket fill
- Lasso selection
- Text to diagram
- Mermaid to Excalidraw
- Wireframe to code

The actual rendering/behavior is delegated to Excalidraw rather than reimplemented by Sketchizi.

## Important

This is intentionally based on the `next` distribution rather than stable `0.18.1`. Stable `0.18.1` exposes a smaller tool surface; the newer toolbar/tool registry used by the requested UI is present in the newer Excalidraw development line.
