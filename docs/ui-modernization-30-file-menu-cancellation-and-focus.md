# UI Modernization 30 — File-Management Cancellation & Focus Refinement

## Goal

Make interrupted file-opening actions feel intentional and predictable without changing existing drawing, folder, or persistence workflows.

## Changes

- Treat native picker `AbortError` and normalized `cancelled` errors as user cancellation, not as an unexpected failure.
- Announce cancellation in the file-menu live region using neutral language.
- Preserve cancellation and actionable error announcements during busy-state cleanup rather than replacing them with generic completion text.
- Keep the shared opening helper responsible for restoring disabled, `aria-busy`, and `data-opening` state regardless of outcome.
- Preserve existing file-action error handling and silent cancellation behavior in the file manager.

## Verification

Run:

```sh
node --test tests/ui-modernization-file-menu-interaction-recovery.test.js tests/ui-modernization-file-workflow-recovery.test.js tests/ui-modernization-file-menu-accessibility.test.js tests/ui-modernization-file-menu-hierarchy.test.js tests/ui-modernization-file-menu-responsive.test.js tests/ui-modernization-recent-files.test.js tests/ui-modernization-recent-folders.test.js
npm run test:ui-modernization
```

Live-browser verification should still cover keyboard focus after closing/reopening the native menu, picker cancellation in supported browsers, screen-reader announcements, and real filesystem permission failures.
