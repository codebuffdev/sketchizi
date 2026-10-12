# Sketchizi 1.10.40 — Icon Library sizing and light theme

## Changes
- Reduced the desktop floating Icon Library footprint to a maximum width of 920px and height of 680px, with viewport-relative sizing on smaller desktop windows.
- Preserved the fixed header/search/filter area and results-only scrolling.
- Fixed light-theme cascade conflicts so the dialog, controls, cards, preview tiles, tags, menus, and scrollbar use coordinated light surfaces instead of mixing a dark shell with white cards.
- Softened the backdrop in light theme so the canvas remains visible without a heavy gray wash.
- Preserved icon catalog, favorites, drag/drop, insertion, pinning, and search behavior.

## Validation
- Icon Library layout assertions cover modal dimensions, results-only scrolling, and light-theme overrides.
