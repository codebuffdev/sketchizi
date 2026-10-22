# Breakscale-Inspired Workbench Redesign — Phase 12

## Purpose
Make typed relationships inspectable and traceable between the canvas and the engineering model.

## Changes
- Resolve a selected canvas connector's `customData.workbench.relationId` back to the canonical typed relationship record.
- Pass the selected relationship into the Workbench inspector.
- Show relationship type, source, target, semantic ID, and design view when a typed connector is selected without a component selection.
- Turn connected-relationship rows into accessible actions that focus the corresponding connector on the canvas.
- Add restrained light/dark styling and visible keyboard focus states for relationship inspector controls.
- Preserve the existing model as the source of truth; connector styling is not used to infer semantic meaning.
- Preserve package version `1.10.86`.

## Verification
Executed:

```bash
node --test tests/workbench-relation-inspector.test.js tests/typed-relation-scene.test.js tests/workbench-panel-layout.test.js tests/workbench-registry.test.js tests/workbench-document-prototype.test.js tests/workbench-persistence-lifecycle.test.js tests/workbench-model.test.js tests/workbench-validation.test.js tests/workbench-artifacts.test.js tests/sketchizi-format.test.js
```

Result: **85 passed, 0 failed**.

Production build and live-browser interaction were not run in this environment. The tests include source-wiring assertions for the new selection and focus behavior, so they do not replace manual browser verification.
