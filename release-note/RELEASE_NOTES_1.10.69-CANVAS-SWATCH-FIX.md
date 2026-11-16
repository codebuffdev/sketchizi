# Sketchizi 1.10.69 — Canvas swatch selection fix

- Detect canvas background swatch interactions during capture-phase `pointerdown`, including swatches rendered outside the original dropdown container.
- Mark the background as custom before Excalidraw handles the selection so theme synchronization does not immediately overwrite the selected color.
- Apply the selected swatch color directly through the Excalidraw API as a fallback, while retaining native menu behavior.
- Existing theme-following behavior remains enabled until the user explicitly selects a palette color.
