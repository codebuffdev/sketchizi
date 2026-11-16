# UI Modernization Phase 20 — Toolbar Dock Polish

## Scope

This phase improves the existing Excalidraw toolbar without replacing native tools, shortcuts, or click handlers.

- Replaces browser-native hover labels for toolbar controls with a small body-level tooltip so content is not clipped by the vertically scrollable dock.
- Shows the tooltip on pointer hover and keyboard focus, and places it toward the canvas: to the right of a left-edge dock, to the left of a right-edge dock, and above horizontal controls when there is room.
- Preserves each control's accessible name with `aria-label` when a label was previously available only through `title`.
- Cleans up tooltip event listeners and the tooltip portal when the canvas component unmounts.
- Keeps active-tool, hover, disabled, keyboard-focus, and reduced-motion states consistent with the dock theme.

## Verification

Source-contract tests cover portal placement, edge-aware tooltip positioning, accessible names, event cleanup, theme styling, and the existing native toolbar behavior. Browser rendering has not been verified in this environment.
