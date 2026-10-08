# Sketchizi 1.10.13 — Auto-open on Selection Fix

- Fixed the Properties auto-open selection handler so it reads the current `propertiesAutoOpen` preference through a synchronized ref.
- Preserved the existing `sketchizi-properties-auto-open` localStorage persistence.
- Preserved manual Properties opening and all existing selection behavior.
- No theme, canvas, collaboration, sharing, device detection, or file-management behavior changed.
