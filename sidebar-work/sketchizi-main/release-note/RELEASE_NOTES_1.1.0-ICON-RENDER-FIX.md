# Sketchizi 1.1.0 — Icon Render Fix

## Fix
- Icon library drag gesture now reaches the canvas successfully.
- Eraser SVG icons are fetched and rasterized to self-contained PNG data before being registered with Excalidraw.
- Image elements are inserted only after the PNG has loaded successfully.
- Sketchizi icon metadata is attached after Excalidraw element normalization.

## Why
Excalidraw image elements reference binary file data through `fileId`. The file data must be registered with `addFiles()` and contain a usable `dataURL`. SVG loading can be stricter in newer Excalidraw builds, so Sketchizi now supplies a self-contained PNG payload instead.
