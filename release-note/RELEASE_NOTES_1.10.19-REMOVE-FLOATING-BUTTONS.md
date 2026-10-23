# Sketchizi 1.10.19 — Remove Floating Buttons

Removed the two unwanted Excalidraw floating UI controls at the Sketchizi integration layer:

- desktop top-right default sidebar trigger
- desktop bottom-right Help button

No Icon Library, Minimap, toolbar, theme, collaboration, Properties, or canvas functionality was changed.

The controls are supplied internally by `@excalidraw/excalidraw@0.18.0-c0ad61c`; Sketchizi does not render their React components directly. The integration therefore hides only those two controls with narrowly scoped CSS selectors rather than altering the dependency.
