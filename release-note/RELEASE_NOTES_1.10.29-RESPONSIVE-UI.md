# Sketchizi 1.10.29 — Responsive UI

## Scope
Responsive presentation-only refinement from Sketchizi 1.10.28.

## Changes
- Restored a dedicated application-header lane for 521–1024px supported desktop/tablet widths.
- Kept the application menu available in a horizontally scrollable header lane instead of allowing page-level overflow.
- Kept Validation, Theme, Collaboration creation, and Search/action controls in the existing header system with compact breakpoint-specific sizing.
- Kept the native Excalidraw drawing toolbar as the single toolbar implementation and preserved its top-center placement on 521px+ supported widths. Its containing lane becomes viewport-safe and horizontally scrollable when the native toolbar exceeds the available width.
- Coordinated collaboration status placement below the native toolbar at 521–900px so it does not overlap the drawing toolbar.
- Coordinated Library, Properties, Validation, and Layout overlays below the collaboration status lane when necessary.
- Kept the Minimap inside the available viewport and above the bottom native-control lane.
- Preserved the established <=520px phone presentation rules unchanged.

## Responsive breakpoints
- `>= 1025px`: existing desktop composition preserved.
- `761–1024px`: dedicated compact tablet header and viewport-safe floating toolbar.
- `521–760px`: narrow-desktop/small-tablet compact header and viewport-safe floating toolbar.
- `<= 520px`: existing phone presentation untouched by this release.

## Functionality
No React state, event handlers, collaboration functions, WebSocket behavior, Excalidraw API calls, file operations, theme state, icon catalog, validation logic, or export logic were changed.
