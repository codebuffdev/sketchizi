# Sketchizi 1.10.38 — Canvas Background Menu Accessibility Fix

## Root cause

The Canvas background heading and its existing color swatches are provided by Excalidraw. Sketchizi does not render or remove those swatches. The hamburger-menu scroll rule was scoped to `.excalidraw .dropdown-menu-container`, which assumes the main menu is a descendant of `.excalidraw`. Excalidraw's main-menu structure is `.dropdown-menu > .dropdown-menu-container`; when it is rendered outside the `.excalidraw` subtree, the custom viewport and vertical-scroll constraints do not apply.

## Fix

- Scope the existing viewport-height and vertical-scroll rules to `.dropdown-menu > .dropdown-menu-container` so they match the native main-menu structure regardless of where Excalidraw mounts it.
- Preserve the existing narrow-screen and desktop/tablet height calculations, safe-area handling, single scroll owner, and scroll chaining behavior.
- Update the UI-defaults regression test to assert the wrapper-scoped selector.

No Canvas background state, color choices, theme synchronization, Layout-removal behavior, or other application features were changed.

## Validation

Automated checks and ZIP integrity are recorded in the delivery report. Browser interaction at the supplied screenshot viewport remains unverified in this environment.
