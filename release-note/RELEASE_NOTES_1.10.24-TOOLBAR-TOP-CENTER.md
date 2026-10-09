# Sketchizi 1.10.24 — Toolbar Top Center

## Change

Moved the existing Excalidraw drawing toolbar to a fixed top-center position immediately below the Sketchizi application header on supported desktop/tablet widths.

## Implementation

- Reused the existing Excalidraw `.App-toolbar-container`.
- Changed only its viewport positioning with scoped CSS.
- No toolbar markup was recreated or duplicated.
- No tool handlers, shortcuts, active-tool state, or Excalidraw integration were changed.
- Mobile/phone layouts retain Excalidraw's existing bottom toolbar behavior.

## Preserved

Minimap, Properties, Icon Library, collaboration, theme behavior, canvas interaction, and all existing toolbar functionality remain unchanged.
