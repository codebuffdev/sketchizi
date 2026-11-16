# Sketchizi 1.10.12 — Theme-Only Bug Fix

## Fixed

- Theme toggle now synchronizes the existing Excalidraw `viewBackgroundColor` when the canvas is using the theme-managed/default background.
- Manual Canvas background selections are preserved; changing the manual background stops automatic theme background replacement until the canvas returns to a theme-managed background.
- Start Collaboration now uses existing Sketchizi theme tokens in dark mode while preserving its existing functionality and light-mode appearance.
- Existing dark dropdown/menu visibility rules are preserved.

## Scope

Theme-only bug fix. No collaboration, sharing, device detection, canvas tools, validation, or manual Canvas background functionality was redesigned.
