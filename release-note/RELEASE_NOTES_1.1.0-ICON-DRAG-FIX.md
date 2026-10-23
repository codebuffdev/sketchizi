# Sketchizi 1.1.0 — Icon Drag Fix

- Keeps the working pointer-driven Icon Library drag interaction.
- Inserts the image element and its BinaryFileData in the same Excalidraw `updateScene()` call.
- Registers the same file with `addFiles()` for subsequent persistence/file-manager lookups.
- Uses a self-contained PNG data URL for the Eraser icon asset.
