# Sketchizi 1.10.11 — Theme Bug Fix

## Fixes

- Fixed Excalidraw canvas background synchronization when switching the existing Sketchizi light/dark theme.
- Theme synchronization now waits for the Excalidraw API to be ready, while preserving manually selected canvas backgrounds.
- Fixed dark-mode readability of the desktop application dropdown menu items and keyboard shortcut labels.
- Preserved the existing Sun/Moon header toggle, collaboration, sharing, canvas, responsive behavior, and theme persistence architecture.

## Validation

- Confirm light/dark theme state continues to use `diagram-app-theme`.
- Confirm the existing Canvas background control remains available.
- Confirm desktop menu text and shortcut labels remain readable in dark mode.
