# Sketchizi 1.10.38 — Hamburger Scroll + Default Dark Theme

## Scope and baseline

Based solely on `PARTLY-STABLE-Sketchizi-1.10.37-collaboration-sync-diagnostics.zip` (package version `1.10.37`). This release addresses only hamburger-menu vertical scrolling and the default application theme.

## Hamburger menu scrolling

The existing Excalidraw `.dropdown-menu-container` is the containing element for the hamburger menu, including Sketchizi-injected Files/Recent/Theme/Layout sections. Those injected sections can make its intrinsic content taller than the available viewport. The scoped CSS now constrains that same container to the usable viewport height, enables vertical scrolling, suppresses horizontal overflow, reserves scrollbar space where supported, contains scroll chaining, and accounts for the existing app-header lane on desktop/tablet. Safe-area insets are accounted for on narrow screens.

No menu items, handlers, menu hierarchy, or file actions changed.

## Default theme

Theme initialization now synchronously resolves the existing `diagram-app-theme` preference before the first React render:

1. Valid saved `dark`, `light`, or `system` preferences are retained.
2. Missing, invalid, or inaccessible storage falls back to `dark`.
3. Existing System mode continues to use the OS effective theme.

The existing persistence key, theme selector, header toggle, Excalidraw theme prop, and canvas-background synchronization/customization logic remain unchanged. No saved theme preference is intentionally overwritten by the new default.

## Automated checks actually run

- `npm run test:ui-defaults`: 3 passed, 0 failed.
- `npm run test:sync`: 22 passed, 0 failed.
- `npm run test:chat`: 10 passed, 0 failed.
- `npm run test:networking`: 4 passed, 0 failed.
- `npm run test:catalog`: 3 passed, 0 failed.
- `npm run test:sync-performance`: completed the existing synthetic Node sample for 100, 1,000, and 5,000 elements; this is not browser performance validation.
- `node --check` for the new theme helper, modified preferences hook, and new test file: passed.
- CSS parsing of `src/styles/responsive-touch.css` with `tinycss2`: 0 parse errors.

## Build and manual-validation limitation

`npm run build` was attempted and failed with `sh: 1: vite: not found` (exit 127) because dependencies are not installed in the environment. The app could not be exercised in a live browser here. Manually verify scrolling to the last menu item at normal and short viewport heights, resizing while open, and Light/Dark/System preference persistence in a browser. Custom canvas background handling was not changed; verify it using a drawing with a known custom background.
