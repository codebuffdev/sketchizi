# UI Modernization 17 — Contextual Formatting Toolbar

## Scope

The contextual toolbar appears only while one or more canvas elements are selected and editing is allowed. It is rendered inside the canvas workspace and follows the selected scene bounds as Excalidraw updates its viewport.

## Controls

- Stroke color presets apply through Sketchizi's existing `applyToSelected` callback.
- Fill presets are shown for rectangle, diamond, and ellipse selections.
- Stroke width presets are shown for lines, arrows, and shapes.
- Text selections expose compact font-size decrement/increment actions.
- More opens the existing Properties panel for full formatting options.

The component does not recreate Excalidraw tools or replace their handlers. It is hidden in view-only sessions and supports both light and dark themes.

## Validation

Automated source-contract tests live in `tests/ui-modernization-17-contextual-toolbar.test.js`.

Before release, manually verify:

1. Select one rectangle and apply a stroke and fill; confirm the selected shape updates immediately and undo still works.
2. Select an arrow and change stroke color/width.
3. Select text and use the A−/A+ controls.
4. Pan and zoom with a selection; confirm the toolbar remains close to the selection and within the canvas bounds.
5. Use More to open the Properties panel.
6. Check light/dark themes, narrow windows, keyboard focus, and collaboration view-only mode.
