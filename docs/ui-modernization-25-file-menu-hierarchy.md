# UI Modernization 25 — File-Management Menu Hierarchy

## Goal

Clarify the file-management menu's information hierarchy and interaction feedback without changing existing Recent Files, Recent Folders, or folder-browsing behavior.

## Changes

- Grouped the menu into Workspace, Current folder, File actions, and Quick access sections.
- Kept Open folder and New file together as primary actions.
- Added explicit labels and accessible relationships for the expandable Recent Files and Recent Folders panels.
- Standardized keyboard focus visibility, disabled-action feedback, theme-aware section labels, and reduced-motion handling.
- Preserved folder refresh announcements, permission/missing-folder messages, recent item open/remove/clear actions, and folder browsing.

## Verification

Run:

```sh
node --test tests/ui-modernization-file-menu-hierarchy.test.js tests/ui-modernization-file-management.test.js tests/ui-modernization-recent-files.test.js tests/ui-modernization-recent-folders.test.js
npm run test:ui-modernization
```

These tests validate source-level contracts and regressions. Live-browser visual checks, real File System Access API permission flows, and a production build remain separate verification steps.
