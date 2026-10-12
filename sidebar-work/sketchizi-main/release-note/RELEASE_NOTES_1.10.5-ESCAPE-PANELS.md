# Sketchizi 1.10.5 — Central Escape Dismissal

## Change

Escape handling for Sketchizi-owned UI is now centralized in the existing
application keyboard-shortcut handler (`useSketchiziPreferences`).

## Behavior

Dismissal priority is:

1. Open Collaboration modal/dialog.
2. Otherwise, the single active Sketchizi panel (`activePanel`), including
   Layout, Icon Library, Properties, More Tools, and Shortcut Help.
3. Otherwise, preserve the existing Sketchizi connection-mode Escape behavior.
4. With no Sketchizi-owned overlay active, Escape is not consumed by Sketchizi,
   leaving Excalidraw's native Escape behavior intact.

Only one layer is dismissed per Escape press.

## Implementation

`useMoreTools` no longer registers its own document/window Escape listener.
This removes a competing global listener and makes the existing central
keyboard handler the single Sketchizi Escape entry point.

The Layout state, portal/mounting, positioning, CSS, collaboration transport,
undo/redo, file management, toolbar, and canvas architecture are unchanged.
