# UI Modernization Phase 19: Canvas Grid and Grid Snapping

## Behavior

- `G` shows or hides Sketchizi's lightweight visual canvas grid.
- `Shift+G` enables or disables grid snapping independently of grid visibility.
- The visual grid uses a subtle dot pattern, scales with canvas zoom, and tracks pan offsets. Spacing follows the configured Sketchizi grid size.
- Excalidraw's built-in `gridModeEnabled` stays disabled so it cannot couple its native grid rendering to the snapping toggle.
- When snapping is enabled, newly created or geometrically changed elements are snapped at the end of a pointer gesture. Multi-selection moves use a shared correction to preserve spacing.
- Icon insertion continues to use the existing grid-size and snapping settings.
- The grid overlay does not intercept pointer events and uses separate light/dark theme colors.
- The View menu and command palette expose separate commands for showing the visual grid and toggling grid snapping.

## Interaction details and limitations

- Grid snapping is applied at gesture completion, not continuously during a drag. This phase does not implement live alignment guide lines.
- Snapping adjusts scene geometry through the Excalidraw API without replacing native tool handlers.
- Deleted elements and unchanged elements are not rewritten. Grid snapping is disabled in view-only mode.
- Browser-level visual validation is still needed to confirm overlay alignment with rendered Excalidraw content at different zoom levels, pans, and canvas sizes.

## Validation

Source-level regression tests cover the independent visual state, menu/command wiring, keyboard shortcuts, grid zoom/pan inputs, theme styles, overlay pointer transparency, and the gesture snapping helper for new elements, moved shapes, multi-selections, and arrows. A production build and real-browser visual review remain necessary after installing dependencies.
