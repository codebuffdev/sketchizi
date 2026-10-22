# Workbench Phase 10 — Narrow Desktop Workspace Switcher (1.39)

## Purpose
Provide an explicit way to switch between Palette, Canvas, Engineering, and Inspector when the browser is in the 761–1100px desktop range, rather than trying to show every region simultaneously.

## Changes
- Added a narrow-desktop workspace switcher in `src/App.jsx`.
- Added state for the active narrow workspace region; this is presentation state and does not modify the engineering model or saved document payload.
- Added responsive CSS that shows the selected region in the content row beneath the switcher.
- Added a focused regression test for the four view choices and their region selectors.
- Kept package version unchanged at `1.10.86`.

## Verification
- Ran `node --test tests/workbench-panel-layout.test.js tests/workbench-registry.test.js tests/workbench-document-prototype.test.js tests/workbench-persistence-lifecycle.test.js`.
- Result: 39 tests passed, 0 failed.
- ZIP integrity is checked after packaging.
- Production build and browser visual testing were not run. Dependencies are not installed in this extracted source bundle.

## Limitations
- The view choice is in-memory and resets to Engineering when the application reloads; this phase does not persist the choice.
- The 761–1100px behavior is covered by source-level tests, not an actual browser screenshot.
- Wide-desktop multi-region layout remains unchanged.
