# UI Modernization 15 — Toolbar Drag Cleanup

## Scope

This phase hardens the lifecycle of the floating canvas toolbar's existing drag interaction. It does not replace Excalidraw controls, tool handlers, or keyboard shortcuts.

## Changes

- Track the active pointer-drag cleanup callback for the dock.
- Remove the temporary `pointermove`, `pointerup`, and `pointercancel` listeners through one idempotent cleanup path.
- End an active drag when the canvas effect is cleaned up, preventing global listeners from remaining after unmount.
- Register pointer completion events as one-shot listeners in addition to removing them explicitly during cleanup.
- Add focused source-contract regression tests for listener lifecycle and cleanup behavior.

## Validation

Ran:

```sh
node --test tests/ui-modernization-toolbar-drag-cleanup.test.js tests/ui-modernization-toolbar-resilience.test.js tests/ui-modernization-toolbar-tooltips.test.js tests/ui-modernization-toolbar.test.js
```

Result: 12 tests passed, 0 failed.

Production build and browser interaction testing were not run in this environment because project dependencies (`node_modules`) are not installed. The tests are source-contract checks and do not substitute for runtime verification.
