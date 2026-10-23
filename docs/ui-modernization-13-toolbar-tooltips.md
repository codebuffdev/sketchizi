# UI Modernization 13 — Toolbar Tooltips and Group Boundaries

## Goal
Improve toolbar discoverability while retaining Excalidraw's native controls and keyboard behavior.

## Changes
- Native toolbar buttons receive concise browser hover labels derived from their existing accessible name.
- Where Excalidraw renders a shortcut hint inside the button, the hint is included in the hover label.
- Group separators are inserted only at recognized direct-child boundaries; native tools are not reordered, wrapped, or recreated.
- The toolbar enhancement remains attached through the existing mutation observer so native toolbar updates can be decorated as they appear.

## Validation
Run `node --test tests/ui-modernization-toolbar-dock.test.js tests/ui-modernization-toolbar-tooltips.test.js`.
The tests are source-contract checks; browser-level visual and interaction validation is still required before release.
