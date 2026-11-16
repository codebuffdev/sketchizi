# Sketchizi 1.10.32 — Networking Icon Differentiation

## Changes
- Replaced the generic Networking catalog glyph with a dedicated SVG glyph for each of the 14 networking resource types.
- Added matching editable Excalidraw-native glyphs to each inserted Networking resource group.
- Preserved the networking resource identity and metadata on grouped elements so selection, properties updates, persistence, duplication, and collaboration continue using the existing model.
- Increased the resource card height and separated title, icon, and details to avoid the title/icon overlap visible in the prior implementation.

## Validation
- Source syntax and networking unit tests were checked where available.
- Browser rendering and production build must be verified in an environment with project dependencies installed.
