# UI Modernization 24 — Recent Folders and Refresh Feedback

## Goal

Make the existing Recent Folders workflow easier to understand and recover when browser directory permissions change, without introducing a new file-management system.

## Changes

- Recent folder entries expose a folder/read-only type label, relative last-opened time, accessible name, and actionable status label.
- Missing directory handles persist an `availability: "missing"` state; permission failures persist `availability: "permission"`. A successful access check clears stale warnings and records a check time.
- The current-folder Refresh action is disabled when there is no linked directory handle or while a refresh is already running.
- Refresh reports loading, success (including the number of supported drawings and time), permission failure, missing folder, or a generic retry message through an `aria-live` status region.
- The refresh control supports light/dark theme colors and reduced-motion settings.
- Existing recent-folder retention and open/remove/clear actions remain in place.

## Verification

Run:

```sh
node --test tests/ui-modernization-recent-folders.test.js tests/ui-modernization-recent-files.test.js tests/ui-modernization-file-management.test.js
npm run test:ui-modernization
```

Source-level checks verify presentation helpers, persisted status transitions, refresh feedback, and accessible row metadata. A live-browser test is still needed to validate permissions and rendering against a real File System Access API implementation.
