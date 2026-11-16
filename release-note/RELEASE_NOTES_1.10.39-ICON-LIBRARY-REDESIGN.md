# Sketchizi 1.10.39 — Icon Library redesign

## UI changes

- Replaced the fixed-width resource sidebar with a centered, floating Icon Library window so more of the diagram canvas remains visible.
- Added a compact source-chip row for All, Eraser, AWS, Kubernetes, and Collections.
- Added recent-search chips with a Clear all action and persisted the five most recent queries locally.
- Redesigned results as informative horizontal cards with monochrome previews, source labels, tags, favorite controls, and purple insert actions.
- Added card/list view controls and a compact card-density option.
- Added a thin purple scrollbar to the independently scrolling results region; the header, search, source chips, and recent searches remain fixed.
- Kept existing catalog sources and category-specific AWS/Kubernetes filters available, with additional categories exposed through Collections.
- Expanded search matching to include icon category, source, and tags in addition to existing names, IDs, and aliases.
- Added a light-theme variant while using the approved charcoal/purple treatment in dark mode.

## Verification

- JSX syntax checked with the installed TypeScript transpiler.
- `tests/architecture-catalog.test.js`, `tests/icon-library-layout.test.js`, `tests/networking.test.js`, and `tests/ui-defaults.test.js`: passed.
- A full Vite production build could not be run in this environment because npm registry requests failed with `EAI_AGAIN` while installing dependencies.
