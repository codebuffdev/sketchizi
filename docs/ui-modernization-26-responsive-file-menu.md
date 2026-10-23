# UI Modernization 26 — Responsive File-Management Menu

## Goal

Improve the file-management menu's behavior in short viewports and narrow screens while preserving Phase 25 hierarchy and existing file/folder workflows.

## Changes

- Constrain the custom file menu to a viewport-aware maximum height and allow contained vertical scrolling.
- Increase disclosure rows and common controls to more comfortable interaction heights.
- Allow long recent-file and folder names and metadata to wrap instead of forcing horizontal overflow.
- Stack primary actions on very narrow screens while retaining the two-column layout at normal widths.
- Keep reduced-motion behavior explicit for the menu's scrolling interactions.

## Verification

Run:

```sh
node --test tests/ui-modernization-file-menu-responsive.test.js tests/ui-modernization-file-menu-hierarchy.test.js tests/ui-modernization-recent-files.test.js tests/ui-modernization-recent-folders.test.js
npm run test:ui-modernization
```

These are source-contract and regression tests. Confirm actual visual behavior at narrow viewport sizes, keyboard operation, and file-system permission flows in a live browser before deployment.
