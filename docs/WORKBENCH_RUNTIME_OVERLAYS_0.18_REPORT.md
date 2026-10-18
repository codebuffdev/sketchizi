# Sketchizi Workbench 0.18 — Runtime Status Overlays

## Objective

Put the selected simulation scenario's component metrics directly on the Excalidraw canvas, taking the existing event-derived simulation results as evidence. This iteration adds visualization; it does not change the engine model, scenario calculations, or artifact generators.

## Implemented

- Added `src/features/simulation/experiments/runtimeOverlayModel.js` to build a compact overlay model from a completed selected scenario.
- Added canvas-level HTML status badges aligned to active-view Workbench component placements using Excalidraw's current scroll and zoom transform.
- Added a small scenario banner that labels the data as **SIMULATED** and **Not live telemetry**.
- Added explicit status states based on returned engine evidence: capacity pressure (dropped requests), failures observed, high utilization (at least 80%), no pressure signal, and traffic source.
- Database/service badges display modeled utilization plus dropped or failed requests where applicable. The React traffic-source badge uses offered arrivals from the simulation's event-derived time series.
- Clicking a badge focuses the corresponding Workbench entity.
- Badge layout tracks scene changes, zoom/pan, and canvas resize. Its display size is clamped to remain readable at different zoom levels.
- Overlays are transient React UI. They are not inserted into Excalidraw scene elements, do not create model revisions, and are not written into `.sketchizi` documents.
- Overlay data is cleared/hidden when results are missing, blocked, stale, from a different model revision, from a semantically changed model, or from another active view.
- Historical completed runs can provide overlays only when the current model/profile freshness checks pass.
- Added tests for selected-scenario mapping, source load derivation, pressure/failure labeling, stale-result guards, semantic snapshot mismatches, active-view behavior, and App → Workbench → Run → canvas wiring.

## Verification

Focused selected test commands passed with zero failures:

| Command group | Passed | Failed |
|---|---:|---:|
| Simulation (includes runtime overlay model/UI tests) | 66 | 0 |
| Simulation guidance | 35 | 0 |
| Workbench UI | 32 | 0 |
| Workbench validation | 25 | 0 |
| Workbench format/persistence | 22 | 0 |
| Collaboration sync | 35 | 0 |
| Browser-verification server protocol | 6 | 0 |
| OpenAPI/SQL artifacts | 11 | 0 |
| POC template | 13 | 0 |

These command groups overlap; the numbers are test executions, not unique test cases.

A TypeScript transpiler syntax check passed for `App.jsx`, `SketchiziCanvas.jsx`, `WorkbenchPanel.jsx`, and `SimulationExperimentPanel.jsx`. `node --check` passed for the new runtime overlay model. ZIP integrity was checked after packaging.

## Not verified

- Production build did not reach Vite. `npm run build` failed in `prebuild` because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is missing in this environment.
- Real-browser display/positioning has not been verified here. The overlay uses the same scene-to-viewport transform pattern already used by Sketchizi's collaboration-selection overlay, but the packaged UI still needs a local browser check.

## Local verification

From the extracted `sketchizi-main` directory:

```powershell
npm ci
npm run build
npm run test:simulation
npm run test:simulation-guidance
npm run test:workbench-ui
npm run dev
```

Create the React → REST → PostgreSQL POC, confirm assumptions, run the suite, and select `5× traffic`. Verify that the React source, REST service, and PostgreSQL placements show scenario-specific overlay badges. Check that a high-pressure database shows utilization and dropped requests, selecting the badge focuses its component, switching away from the run's view hides the overlay, and changing the model/profile removes stale overlays until a fresh run completes.

## Scope boundary

The iteration does not add live telemetry, per-request traces, new simulation metrics, or animated run-time behavior. Badges use only values emitted by the existing synthetic discrete-event engine. App package version remains `1.10.86`; 0.18 is a Workbench prototype iteration label.
