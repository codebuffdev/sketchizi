# Simulation Comparison and Explanations — Prototype 0.12

## Purpose

Expose cross-scenario comparisons and model-linked interpretation as a Sketchizi-owned Engineering Workbench capability. Breakscale is an inspiration/reference for simulation concepts only; this work does not import its UI or adopt its application architecture.

## What changed

- Added `buildScenarioComparisonOverview(experimentSuite, workbench)` as a UI-neutral helper in `src/features/simulation/experiments/simulationExperimentModel.js`.
- The helper summarizes each available scenario against baseline: success rate, successful throughput, successful p95 latency, drops, failures, and deltas.
- It aggregates per-node measurements back to source Workbench entity IDs, retaining utilization, drops, failures, arrival count, queue-wait p95 and service-time p95.
- It creates conservative insight records for increased drops, increased successful-request p95 latency, and lower success rate. Each insight includes evidence and model entity IDs, and labels the result as a synthetic model signal.
- The Experiment UI now presents an all-scenario comparison, component pressure comparison, and cross-scenario insights. Selecting a scenario insight changes the active scenario; selecting a component focuses it on the canvas.
- Findings are not described as live telemetry or proof of production behavior.

## Behavioral rules

- Only completed runs contribute metrics.
- The baseline delta is `0` for baseline itself and `null` when a comparison cannot be calculated.
- Component stats are keyed by `sourceEntityId`, not runtime node IDs, so the UI can navigate to the canonical Workbench entity.
- Insights are based on deltas in measured simulation output, not on speculative root-cause attribution. If per-component evidence does not isolate one contributor, the finding says so.
- No model/profile/engine behavior is changed by this UI layer.

## Verification

- Full Node test suite: 243 passed, 0 failed.
- Added regression coverage for a full scenario overview, baseline/surge/outage scenario order, model-linked component rows and evidence-bearing insights.
- `node --check` passed for the changed non-JSX module and its test.
- Production build not verified: the prebuild script fails because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is missing. This environment's dependencies are incomplete.
- Real-browser interaction is not verified in this environment.

## Known limits

- Results currently remain session-local; this feature does not persist simulation runs as durable experiment history.
- Component comparison is limited to metrics supplied by the current engine version.
- Insight ranking is a transparent heuristic, not causal inference.
- The summary UI is subject to usability testing in the actual browser and narrow workbench panel.

## Next gate

Restore dependencies locally, build, and test the complete flow in a browser. Then verify that selecting each scenario insight focuses the correct canonical entity and that the comparison view remains readable at narrow widths. OpenAPI/SQL generation remains paused until the simulation path is reliable and explainable end to end.
