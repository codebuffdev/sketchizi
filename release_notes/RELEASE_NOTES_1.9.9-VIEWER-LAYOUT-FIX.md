# Sketchizi 1.9.9 — Viewer UI + Layout placement fix

## Viewer/read-only UI
- The native Sketchizi menu now receives the existing collaboration edit capability (`collaborationCanEdit`).
- Host/editor keep the existing Properties/file/theme/auto-open menu sections.
- Viewer changes the custom section heading from `Properties` to `Collaboration` and keeps the Collab action available.
- Viewer no longer sees the custom file-management, theme, or auto-open sections that imply document/canvas management.
- The floating Properties auto-open trigger is suppressed for viewers.
- Canvas pan/zoom/navigation, collaboration status, edit requests, and remote activity behavior are unchanged.

## Layout
- Layout is no longer beside Collab.
- A single Layout trigger is appended as a separate bottom action in the existing native sidebar/menu.
- The trigger calls the existing `openPanel("layout")` state path; no second Layout state/component was introduced.
- The existing `LayoutToolbar` remains the only Layout UI and continues to enforce `readOnly` on alignment/distribution/grid editing actions.
- The bottom action is sticky so it remains reachable in a scrollable menu.

## Scope
No collaboration protocol, permission enforcement, presence, authorship, undo/redo, file implementation, toolbar, or icon-library behavior was changed.
