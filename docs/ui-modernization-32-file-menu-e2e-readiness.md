# UI Modernization 32 — File-Management End-to-End Readiness

## Goal

Improve assistive-technology context and operation-state feedback in the repository picker, and make the remaining browser verification requirements explicit without changing existing file workflows.

## Changes

- Associate the repository picker dialog with its visible instruction text using `aria-describedby`.
- Mark the repository list busy while the repository request is pending, and clear that state after either a successful response or a failure.
- Make picker status messages explicitly polite and atomic for screen-reader announcement consistency.
- Add source-level regression tests for dialog description, loading-state cleanup, and error-state cleanup.

## Automated verification

Run:

```sh
node --test tests/ui-modernization-file-menu-e2e-readiness.test.js tests/ui-modernization-file-menu-dialog-focus.test.js tests/ui-modernization-file-menu-accessibility.test.js tests/ui-modernization-file-menu-interaction-recovery.test.js
npm run test:ui-modernization
```

These tests validate source contracts, not real browser rendering. Before deployment, manually verify:

- keyboard traversal and focus restoration on desktop browsers;
- narrow viewport and touch behavior;
- repository loading, empty results, network errors, and Escape/backdrop cancellation;
- screen-reader announcements;
- filesystem permission errors and existing Recent Files / Recent Folders workflows.

Production build and live-browser verification are not claimed by this phase unless run separately in an environment with dependencies and browser tooling available.
