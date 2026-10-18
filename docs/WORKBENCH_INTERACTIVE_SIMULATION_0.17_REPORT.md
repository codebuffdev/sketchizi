# Sketchizi Workbench 0.17 — Interactive Simulation and Scenario-aware Debugging

## Objective

Improve the experiment workflow after comparing Sketchizi's current aggregate-result presentation with interactive simulation tools. This iteration focuses on making capacity experiments answer a useful engineering question and adding visual performance evidence based on actual simulation events.

## Changes

### Scenario-aware capacity experiment

- Added `chooseCapacityImprovementScenarioKey` to select the highest-pressure eligible load scenario from the saved run results; an explicitly selected 5× traffic scenario is preserved.
- Capacity improvement excludes the unavailable-dependency/outage scenario because increasing concurrency does not restore an unavailable database.
- Builds the trial profile using observed `perNode` pressure evidence from the chosen scenario.
- Reruns the chosen scenario with the same workload multiplier and compares that scenario before/after. It no longer compares a capacity change under a stressed scenario against an unstressed baseline.
- Changes the concurrency assumption in a cloned experiment profile and records comparison scenario metadata in the trial history. The canonical model and user's saved base profile are not mutated.

### Adjustable traffic workload

- Added a 2×–10× traffic-surge multiplier control, defaulting to 5×.
- Changing the selected multiplier marks previously displayed results stale until a new run is completed.
- Saved history restores the recorded surge multiplier within the supported range.

### Event-derived time series

- Simulation engine version is now `0.2.0`; result schema version is `2`.
- The engine returns 40 bounded time buckets derived from discrete-event arrival/completion timestamps, covering offered load, successful throughput, successful p95 latency when samples exist, failures, and capacity/buffer drops.
- It does not synthesize chart curves by interpolating aggregate metrics. Empty latency intervals stay empty.
- Completions occurring after the observation window are recorded separately as post-window drain data. Drain metrics remain available for the aggregate run but are not plotted as if they occurred inside the observation window.
- Unknown override diagnostics now identify engine version 0.2.0.

### Performance-over-time UI and history

- Added a collapsible “Performance over time” area in the experiment results with charts for offered/successful request rate, successful p95 by interval, and failures/drops.
- Tooltips expose the source bucket values. The UI discloses that charts come from synthetic discrete-event timestamps and are not live telemetry.
- Event-derived time-series output is retained in saved experiment history and restored with the recorded run.
- The time-series section stays collapsed initially to avoid reintroducing the Workbench sidebar clutter fixed in the previous UI iteration.

## Tests and checks

- Full Node regression run: **231 test executions passed, 0 failed, across 8 test command groups**. Commands covered Workbench UI, POC template, artifacts, simulation guidance, simulation, validation, file-format/persistence, and collaboration sync. Test suites overlap; 231 describes executions, not unique test cases.
- Focused simulation engine/model/history/POC UI checks: **36 passed, 0 failed** after final changes.
- `node --check` passed for changed JavaScript engine/model/history/test modules.
- TypeScript `transpileModule` syntax checks passed for the changed `SimulationExperimentPanel.jsx` and `WorkbenchPanel.jsx`.
- ZIP integrity check performed after packaging.

## Not verified

- Production build remains **unverified**. `npm run build` stops in the prebuild font-copy stage because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent. A locked dependency restore (`npm ci`) timed out in this environment, so the build never reached Vite.
- Real-browser interaction and responsive layout have not been verified for this iteration.
- Runtime metrics are still model-simulation outputs, not live service telemetry.
- This iteration adds time-series charts and scenario-aware improvement comparison; transient per-component status overlays directly on canvas are not included yet.

## Local verification

From the extracted `sketchizi-main` directory on a network-enabled Windows machine:

```powershell
npm ci
npm run build
npm run test:simulation
npm run test:simulation-guidance
npm run test:workbench-poc
npm run test:workbench-artifacts
npm run dev
```

Open the Workbench, run the baseline/traffic-surge/outage suite, select the 5× traffic scenario, and choose **Test a capacity improvement**. Confirm that the before/after comparison uses the same stressed scenario. Expand **Performance over time** and verify the displayed interval series. Save and reopen the `.sketchizi` file, restore experiment history, and confirm the charts and scenario metadata persist.

## Scope and compatibility

- No new frontend framework or simulator backend was introduced.
- Existing model, profile, and scenario validation remain in force.
- Simulation result schema version changed to 2; old saved runs without time-series data should remain displayable without charts. Verify this alongside legacy experiment-history fixtures during browser QA.
- Original stable application version remains `1.10.86`; `0.17` is the Workbench prototype iteration label, not a published app version.

## Suggested Git commit

`feat(simulation): add event-derived charts and scenario-aware capacity trials`
