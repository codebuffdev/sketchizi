# Sketchizi 1.10.27 — Export Dialog UX Fix

## Scope

Focused Export Image dialog lifecycle and feedback fix. Existing Excalidraw image export generation remains unchanged.

## Changes

- Reused the existing Sketchizi centralized Escape handler so Escape closes Excalidraw's `imageExport` dialog first.
- Reused the existing Sketchizi toast mechanism for export success/failure feedback.
- Observed Excalidraw's existing export result toast messages to determine completion without replacing PNG, SVG, or clipboard export implementation.
- On successful PNG, SVG, or clipboard export, show `Image exported successfully` and close the existing Excalidraw export dialog state.
- On recognized export failure, show an error toast and keep the export dialog open for retry.
- No new export state, export implementation, collaboration logic, or theme architecture was introduced.
