# Sketchizi Workbench Phase 6 — Workspace Shell Correction

## Goal
Replace the desktop overlay behavior with a real application layout lane for the Workbench, while preserving the existing Excalidraw canvas and Workbench model.

## Changes
- Moved `WorkbenchPanel` out of the canvas region so it is a sibling in the main desktop workspace.
- Added explicit open/closed Workbench workspace classes.
- On desktop widths above 700px, opening Workbench creates a two-column grid: the canvas receives the remaining width and the Workbench occupies a dedicated side lane.
- The Workbench side lane uses normal layout flow instead of absolute positioning and overlay shadowing.
- At 700px and below, retained an overlay fallback so the canvas does not collapse into an unusably narrow column.
- Added regression tests for component placement, desktop grid behavior, and the narrow-screen fallback.
- Did not change the application package version or engineering-model persistence format.

## Validation
- Focused tests: 35 passed, 0 failed (panel layout, registry, document prototype, persistence lifecycle, workspace shell).
- ZIP integrity: verified after packaging.
- Production build and browser visual verification: not run; dependencies are not installed in this source bundle. The JSX file was not treated as syntax-verified by Node because Node's `--check` does not accept `.jsx` directly.

## Known limitation
This phase establishes the dedicated Workbench side lane but intentionally does not yet introduce a separate always-visible inspector lane inside the Workbench. That should follow after visual verification of the shell change.

## Suggested commit
`refactor(workbench): place engineering workspace in a dedicated layout lane`
