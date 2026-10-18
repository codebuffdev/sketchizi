# Sketchizi Workbench 0.21 — Trace-Guided Improvement Comparison

## Objective

Complete the investigation loop from a selected request trace to a targeted capacity experiment and a trustworthy before/after comparison for the same stressed scenario.

## Changes

- A selected trace can guide the capacity improvement target when it belongs to the same completed non-outage scenario and has positive recorded queue wait or corroborating component-level pressure evidence.
- Capacity profile creation still validates scope, runtime component kind, profile presence, and adjustable concurrency. If the selected trace is not an eligible evidence-backed target, selection falls back to scenario pressure evidence.
- Capacity trial history now records before/after run fingerprints, scenario identity, target-selection reason, and selected trace request/hop/timing evidence when applicable.
- Added before/after event-series charts for successful throughput, successful p95 latency, and dropped requests per interval.
- Event-series comparisons are produced only when both completed runs have the same declared source, observation window, point count, and exact time-bucket boundaries. Mismatched series are not interpolated or padded; the UI explains why chart comparison is unavailable.
- Added a measured-outcome summary with four states: improved, mixed, regressed, and no material change. It reports observed metric direction without claiming the tested parameter caused the whole result or guarantees real-world improvement.
- Added styling for the result summary and paired series, including dark theme behavior.

## Verification

### Regression command groups

All 12 command groups passed, with the counts below. The groups overlap; the sum is test executions across commands, not unique test cases.

| Command | Passed | Failed |
|---|---:|---:|
| `test:capacity-improvement` | 26 | 0 |
| `test:simulation` | 79 | 0 |
| `test:simulation-guidance` | 35 | 0 |
| `test:simulation-experiments` | 12 | 0 |
| `test:workbench-artifacts` | 11 | 0 |
| `test:workbench-poc` | 13 | 0 |
| `test:workbench-ui` | 32 | 0 |
| `test:workbench-validation` | 25 | 0 |
| `test:workbench-format` | 22 | 0 |
| `test:sync` | 35 | 0 |
| `test:browser-verification-server` | 6 | 0 |
| `test:trace-investigation` | 13 | 0 |
| **Total test executions across commands** | **309** | **0** |

> Note: The group-level counts above sum to 319 executions (overlap exists between commands).

- Focused tests confirm trace-preferred target selection, safe fallback, exact time-bucket alignment, and summary classification.
- Simulation integration test confirms actual engine outputs for the same stressed scenario produce a usable event-series comparison.
- `npm run example:workbench-simulation`: completed baseline, 5× traffic, and PostgreSQL unavailable scenarios. Its aggregate outputs remained consistent with the prior runner example.
- TypeScript JSX transpiler syntax check for `SimulationExperimentPanel.jsx`: passed.
- ZIP integrity: verified after packaging.

## Remaining verification limits

- Production build: **not verified**. `npm run build` stops in `prebuild` because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent. Vite never starts; dependencies are not installed in this worktree.
- Real-browser interaction: **not verified**. The new trace-guided target selection and before/after charts must be exercised with a full local dependency install.

## Local verification on Windows

From `sketchizi-main`:

```powershell
npm ci
npm run build
npm run test:capacity-improvement
npm run test:simulation
npm run test:trace-investigation
npm run dev
```

Run a completed 5× traffic scenario, select a successful trace with recorded queue wait, choose **Investigate on charts & canvas**, then select **Test capacity at [component]**. Confirm the comparison uses the same stressed scenario, shows before/after aggregate metrics and matched time-series curves, and records the trace context in saved experiment history. If the selected request only has a large service-time contribution without queueing or pressure evidence, the capacity selector should continue to use the scenario-level pressure evidence instead.

## Scope boundaries

- No simulation semantics, workload schedule, or underlying event outputs were modified by the UI comparison.
- The canonical Workbench model and saved base profile remain unchanged by the controlled trial.
- The before/after plots use actual recorded event-derived bucket values; they do not interpolate mismatched bucket layouts.
- All outputs are synthetic simulation results, not live production telemetry.

Suggested commit:

`feat(simulation): link trace evidence to capacity trials and compare time series`
