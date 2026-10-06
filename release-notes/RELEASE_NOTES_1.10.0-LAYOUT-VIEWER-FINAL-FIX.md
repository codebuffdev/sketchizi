# Sketchizi 1.10.0 — Layout + Viewer Final Fix

## Layout

- Reconnected the native-sidebar Layout action to the existing shared `layout` panel state.
- Deferred the panel transition by one animation frame so Excalidraw's native menu-close scene update cannot clear the newly requested Layout panel.
- The keyboard `L` shortcut continues to use the same `layout` panel state.
- Layout is positioned as a viewport-anchored application panel rather than inheriting the old floating-toolbar coordinates.
- Added viewport-safe width/height constraints for narrow screens.

## Viewer

- Collaboration Viewer/read-only state is passed to Excalidraw through its supported `viewModeEnabled` prop.
- Viewer canvas navigation remains available.
- The primary Excalidraw editing toolbar is hidden only while the collaboration permission is `viewer`.
- Host/editor behavior is unchanged.
- Existing collaboration permission enforcement remains authoritative.

## Scope

No collaboration protocol, participant/presence, permissions, undo/redo, file management, Icon Library, or Host/Editor canvas-tool behavior was changed.

## Verification

Source-level syntax checks and archive integrity can be performed in the packaging environment. Browser acceptance testing requires the project's installed npm dependencies and must be run with `npm run build` / `npm run dev` in an environment where Vite is installed.
