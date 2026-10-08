# Sketchizi 1.9.8 — Collaborative Editing Follow + Layout Navigation

## Scope

This release implements the focused collaboration viewport-follow and Layout UI changes. File management, permissions, presence semantics, undo/redo, canvas editing, and collaboration room lifecycle are otherwise unchanged.

## Collaborative active-edit follow

- Remote scene updates now retain the originating participant id.
- The client considers actual changed scene elements, not cursor movement, as editing activity.
- The local viewport is focused only when changed content is outside/near the edge of the current viewport.
- A short local-navigation guard prevents remote activity from immediately overriding a user who is panning/zooming.
- A focus cooldown reduces viewport thrashing when multiple participants edit rapidly.
- Excalidraw's existing `scrollToContent`/viewport APIs are used; no custom viewport synchronization is introduced.
- The remote cursor/presence protocol is not used to drive viewport movement.

## Layout UI

- Removed the permanent floating Layout trigger from the canvas.
- Added Layout to the existing Sketchizi application/sidebar menu beside Collab.
- The existing Layout controls remain unchanged and open through the same panel state.
- Responsive rules keep the Layout panel usable on narrow viewports.

## Validation

- Source syntax checks are required before release packaging.
- Browser/two-window collaboration acceptance tests require an installed dependency tree and browser runtime; they must not be claimed from static inspection alone.
