# Sketchizi 1.8.6 — Narrow Responsive Refinement

Incremental refinement of the 1.8.5 responsive shell.

## Changes

- Preserves the 1.8.5 responsive architecture and 1198px baseline.
- Adds a bounded collaboration lane for 901–1100px widths so the status card does not consume the zoom/undo or minimap lanes.
- Moves collaboration status into a dedicated top status lane at 761–900px, where the bottom-center lane is too constrained.
- When collaboration is active on tablet/mobile, Sketchizi-owned Library, Properties, and Layout surfaces start below the collaboration lane instead of covering it.
- Excalidraw's native toolbar is not repositioned or rewritten.
- No viewport-specific one-off pixel offsets were introduced for individual target sizes; rules are breakpoint-based.
