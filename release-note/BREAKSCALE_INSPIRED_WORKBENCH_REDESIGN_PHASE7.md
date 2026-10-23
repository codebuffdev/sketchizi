# Breakscale-Inspired Workbench Redesign — Phase 7

## Goal
Keep the engineering model navigator and canvas selection synchronized, with a clear selected state that works in light and dark themes.

## Changes
- Model navigator rows now expose `aria-pressed` according to whether their entity is selected on the canvas.
- The selected entity row receives a distinct accent border, background, and inset marker in light and dark themes.
- Navigator activation continues to route through the existing `focusFinding` controller path, which selects the component's canvas container, scrolls it into view, switches to the component's scene when needed, and opens Properties.
- Added focused regression coverage for selected-state accessibility, focus/navigation behavior, and theme styling.

## Verification
Ran the focused regression command across nine test files:

`node --test tests/workbench-navigator-selection-sync.test.js tests/workbench-panel-layout.test.js tests/workbench-registry.test.js tests/workbench-document-prototype.test.js tests/workbench-persistence-lifecycle.test.js tests/workbench-model.test.js tests/workbench-validation.test.js tests/workbench-artifacts.test.js tests/sketchizi-format.test.js`

Result: **78 passed, 0 failed**.

Production build and browser visual verification were not run for this phase.
