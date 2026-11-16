# Sketchizi 1.10.9 — Command Palette Organization

## Changes

- Removed all basic canvas-tool commands from the Command Palette registry: Select, Rectangle, Diamond, Ellipse, Arrow, Line, Draw, Text, and Note.
- Kept the underlying Excalidraw/canvas tools unchanged; they remain on the main canvas toolbar.
- Moved the existing Open Properties command from the removed `Canvas` category into `Tools`.
- Enforced the explicit product category order:
  1. Collaboration
  2. Files
  3. View
  4. Layout
  5. Tools
  6. Export
  7. Application
- Preserved existing command filtering, search, keyboard navigation, Escape handling, and command execution.

## Scope

No canvas-tool implementation, command palette architecture, permissions, collaboration, file management, Layout implementation, or responsive palette styling was changed.
