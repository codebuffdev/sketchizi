# UI Modernization 29 — File-Menu Interaction Recovery

## Goal

Make file-opening feedback consistent across Recent Files, Recent Folders, and the current-folder drawing list, while ensuring transient busy states are always cleaned up.

## Changes

- Consolidated opening-state setup and cleanup into a shared helper for all three file-opening surfaces.
- Announced when an open request begins and when the request ends.
- Announced unexpected rejected operations with a retry-oriented message without claiming the file opened successfully.
- Preserved detailed toast/error handling owned by the existing file-management actions.
- Prevented repeated activation while an item is already opening and retained the existing `aria-busy` visual affordance.

## Verification

Run:

```sh
node --test tests/ui-modernization-file-menu-interaction-recovery.test.js tests/ui-modernization-file-workflow-recovery.test.js tests/ui-modernization-file-menu-accessibility.test.js tests/ui-modernization-file-menu-hierarchy.test.js tests/ui-modernization-file-menu-responsive.test.js tests/ui-modernization-recent-files.test.js tests/ui-modernization-recent-folders.test.js
npm run test:ui-modernization
```

Automated tests validate source contracts. Keyboard and screen-reader announcements, error toasts, and actual file-system operations still require live-browser verification before deployment.
