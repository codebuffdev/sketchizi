# Sketchizi 1.10.1 — Viewer More Tools + Layout Root Fix

## Root causes

- Viewer still rendered Sketchizi's custom `MoreTools` component. Its menu items were disabled, but the trigger itself was always mounted.
- The Layout panel reused a legacy `.layout-toolbar` positioning tree with many later responsive rules written for the old floating-canvas trigger. Those rules could override the new application-level placement and move the panel off-screen.

## Fix

- `MoreTools` is now conditionally rendered only when the existing `collaborationCanEdit` permission is true.
- Excalidraw receives `viewModeEnabled={collaborationPermission === "viewer"}`, using the existing collaboration permission as the role source of truth.
- Layout remains one React `activePanel === "layout"` state and one `LayoutToolbar` component.
- When used as the application-level panel, `LayoutToolbar` renders its panel through `createPortal(..., document.body)`. This makes the document body the positioning context and removes the old canvas/sidebar containing-block assumptions.
- The portal uses a dedicated `.layout-panel-portal` class so legacy `.layout-toolbar .layout-popover` responsive rules cannot match it.
- No collaboration protocol, permissions, presence, undo/redo, file management, or Host/Editor tool behavior was changed.
