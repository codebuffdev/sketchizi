# Sketchizi 1.6.0 — Excalidraw More Tools integration

Sketchizi now consumes the Excalidraw `next` channel instead of stable `0.18.1` so the newer tool-registry toolbar can expose the More Tools menu requested for Sketchizi.

This is deliberately not a hand-built imitation of Excalidraw's menu. The embedded Excalidraw component remains responsible for rendering and activating the tools.

Expected More Tools entries in the newer Excalidraw line:

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

`aiEnabled={true}` remains enabled in Sketchizi so the Generate entries can appear when supported by the installed Excalidraw build.

## Dependency note

Stable `@excalidraw/excalidraw@0.18.1` does not expose the full tool set shown in the requested screenshot. The current npm `next` channel is the intended distribution for these unreleased toolbar/tool-registry changes.

After extraction, run `npm install` so npm resolves the current `next` package and creates a fresh `package-lock.json`.
