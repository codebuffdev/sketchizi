# Workbench Phase 4 — Canvas-space collapse rail (1.29)

## Summary
Added an explicit collapse/expand control to the Engineering Workbench overlay. Collapsing reduces the panel to a narrow rail, hiding the workspace content while retaining expand and close controls. The collapsed state is persisted with the existing Workbench layout preferences and remains separate from the engineering model.

## Files changed
- `src/features/workbench/WorkbenchPanel.jsx`
- `src/styles/workbench.css`
- `tests/workbench-panel-layout.test.js`

## Verification
- 61 focused Workbench tests passed across layout, UI, model, artifacts, validation, registry, document format, and persistence suites.
- ZIP integrity checked after packaging.
- Production build and browser visual test were not run. The source bundle does not include installed `node_modules`, and the previously documented dependency/font-asset build gate remains unresolved.

## Limitations
This is a canvas-space improvement to the existing overlay panel, not yet a full three-column dockable workspace. The navigation and inspector have not been independently docked. No semantic model or artifact-generation behavior was changed.

## Versioning
The Sketchizi package version remains `1.10.86`. `1.29` is the Workbench iteration label only.

## Suggested Git commit
`feat(workbench): add persistent collapse rail to reclaim canvas space`
