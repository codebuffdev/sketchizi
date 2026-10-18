# Workbench 0.14.6 — Quick Connect and Diagnostic Clarity

The latest screenshots showed two distinct UX defects: the canvas appeared connected while the footer still said `0 relations`, and the blocked-results UI rendered `External API is approximated` like a hard blocker. This patch removes the manual multi-step relationship setup from the common simulation workflow and fixes the diagnostic severity presentation.

## Downloadable artifacts

- Patch: `sketchizi-workbench-typed-connection-quick-connect-0.14.6-patch.zip`
- Complete source: `sketchizi-workbench-typed-connection-quick-connect-0.14.6.zip`
- Full Node test log: `workbench-typed-connection-0.14.6-full-tests.log`

## Main behavior changes

1. **One-click semantic links.** Workbench users can create the missing React `Calls` relationship and REST service `Reads from`/`Writes to` database relationship directly from Experiments.
2. **Arrow promotion.** A matching existing visual arrow is tagged with the new relation metadata and added to the canonical model, avoiding a duplicate where its bindings/geometry safely identify the source and target.
3. **No accidental simulation.** Run Experiments is disabled while the React traffic source lacks a typed `Calls` edge. The model isn't guessed from ordinary arrows.
4. **Truthful diagnostics.** Only blocker-severity diagnostics appear in the red blocked area. External API approximation is shown as a separate warning, never portrayed as the blocking cause.
5. **Robust guidance.** The explanation can still identify unique candidate components if scene-derived placements are temporarily unavailable, while disabling link creation until both endpoints are in the active view.

## Test results

- Full Node suite: **283/283 passed**.
- Focused simulation/guidance/quick-connect tests: **29/29 passed**.
- JavaScript syntax checks for changed `.js` modules: passed.
- ZIP integrity: checked after packaging.
- Production build: not verified; the isolated worktree lacks Excalidraw font assets under `node_modules`, and `npm run build` exits in the `prebuild` step. This is an environment/dependency limitation, not a confirmed successful build.
- Real-browser interaction verification: not run for this patch. Please perform the quick-connect workflow locally.

The original stable v1.10.86 ZIP is unchanged.
