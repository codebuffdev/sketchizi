# UI Modernization 14 — Dock Resilience and Mobile Reachability

## Goal
Make the approved toolbar dock more resilient without changing native Excalidraw tool controls.

## Changes
- The grip can be focused and moved with arrow keys on desktop (12px per key press).
- Keyboard movement and pointer dragging clamp the dock to the viewport.
- A dock already positioned by the user is reclamped when the viewport is resized.
- On narrow screens, the toolbar has a bounded viewport width and horizontal scrolling with hidden scrollbars.
- Native tool buttons and their handlers remain untouched.

## Validation
Run `node --test tests/ui-modernization-toolbar-dock.test.js tests/ui-modernization-toolbar-tooltips.test.js tests/ui-modernization-toolbar-resilience.test.js`. These source-contract tests do not replace real browser verification.
