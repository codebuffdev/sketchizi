# Sketchizi 1.10.8 — Command Palette

## Command system

- Added a centralized Sketchizi command registry at `src/features/commands/commandRegistry.js`.
- Commands carry an id, label, description, keywords, category, shortcut metadata, availability predicate, and execute action. Shortcut metadata is only shown where it matches the active Sketchizi shortcut system.
- The palette is an alternate entry point into existing application actions; it does not duplicate the underlying feature implementations.

## Palette UI

- Added `src/components/app/CommandPalette.jsx`.
- Added search, case-insensitive matching across labels/descriptions/keywords, category grouping, mouse selection, arrow-key navigation, Enter execution, and responsive layout.
- Search is focused automatically when the palette opens.
- Escape uses Sketchizi's centralized Escape dismissal path and closes only the palette when it is the topmost application overlay.

## Shortcut

- Sketchizi uses `Ctrl+Shift+P` on Windows/Linux (and `Cmd+Shift+P` on macOS), because inspecting Excalidraw 0.18 shows `Ctrl/Cmd+K` is reserved for hyperlinks and `Ctrl/Cmd+Shift+P` is its built-in command-palette shortcut.
- Sketchizi intercepts the shortcut at document capture level so its palette opens consistently. The existing Excalidraw command palette remains reachable from a dedicated command in the Sketchizi palette.

## Commands

The initial registry contains only commands backed by current Sketchizi/Excalidraw functionality:

- Canvas tools: Select, Rectangle, Diamond, Ellipse, Arrow, Line, Draw, Note.
- More tools: Insert Image, Frame Tool, Web Embed, Draw to Shape, Laser Pointer, Bucket Fill, Lasso Selection.
- Sketchizi panels: Icon Library, Layout, Properties.
- View: Zoom In, Zoom Out, Reset Zoom, Fit to Canvas, Minimap, Theme, Grid.
- Collaboration: Start/Open Collaboration, Request Edit Access, Leave/End Collaboration.
- Files: New, Open, Save, Save As, Open Folder, Close Folder.
- Export: existing Excalidraw image-export dialog.
- Application: Sketchizi keyboard shortcuts and the native Excalidraw command palette.

Commands that are not implemented in the current application (for example Rename, Duplicate, Delete, or a separate SVG export action) are not registered.

## Role awareness

- Editing commands use the existing `collaborationCanEdit` capability derived from the current collaboration permission.
- Viewer users do not see editing commands in the Sketchizi palette.
- Viewer-safe commands such as zoom, fit, theme, collaboration details, request edit access, and leave collaboration remain available.

## Scope

No collaboration protocol, permission semantics, file implementation, undo/redo, Layout panel/positioning, Icon Library implementation, or canvas synchronization logic was rewritten.
