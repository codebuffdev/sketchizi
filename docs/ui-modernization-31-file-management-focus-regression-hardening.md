# UI Modernization 31 — File-Management Focus & Regression Hardening

## Goal

Keep keyboard focus predictable when the repository picker opens, closes, or is dismissed, without changing file and folder workflows.

## Changes

- Move focus into the repository picker search field when the dialog opens.
- Keep Tab and Shift+Tab navigation within the modal dialog.
- Close the dialog with Escape and restore focus to the invoking control.
- Restore focus after the close button or backdrop closes the dialog, provided the invoking control still exists and is enabled.
- Make close idempotent so repeated close paths do not trigger repeated focus restoration.

## Verification

Run:

```sh
node --test tests/ui-modernization-file-menu-dialog-focus.test.js tests/ui-modernization-file-menu-accessibility.test.js tests/ui-modernization-file-menu-interaction-recovery.test.js tests/ui-modernization-file-menu-hierarchy.test.js tests/ui-modernization-file-menu-responsive.test.js tests/ui-modernization-recent-files.test.js tests/ui-modernization-recent-folders.test.js
npm run test:ui-modernization
```

These automated tests verify source-level regression contracts. Live-browser testing is still required for real keyboard traversal, screen-reader announcements, responsive appearance, and filesystem permission behavior.
