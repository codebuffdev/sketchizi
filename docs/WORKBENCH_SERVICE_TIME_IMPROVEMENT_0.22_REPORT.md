# Sketchizi Workbench 0.22 — Service-Time Bottleneck Experiments

## Summary

This milestone adds a second controlled one-variable improvement hypothesis alongside the existing concurrency trial: reduce a runtime component's modeled `meanServiceMs` by 20%, based on event-derived service-time evidence. Both experiments rerun the same selected, completed non-outage load scenario and compare the outputs against that scenario before the change.

This is a synthetic what-if experiment. It does not change application code, SQL queries, the canonical Workbench model, or the saved base profile, and it does not promise the same improvement in a deployed system.

## Behavior added

- `createServiceTimeImprovementProfile` selects an in-scope REST service, PostgreSQL database, or supported external service only when the completed scenario includes recorded per-component service-time evidence.
- If the selected successful trace belongs to the scenario used for comparison and its recorded service time is at least its queue wait, the trace's component can guide the target. Otherwise the helper chooses the component with the largest recorded service-time p95.
- The trial decreases only that component's `meanServiceMs` by 20% (bounded by the existing supported minimum). It does not change concurrency, variability, buffer capacity, write contention, or other profile values.
- The existing concurrency trial remains available as a separate hypothesis. The UI now exposes both **Test higher concurrency** and **Test lower service time**.
- Both actions preserve the same comparison scenario, seed, duration, model, traffic multiplier, and event-derived bucket boundaries.
- Outcome summaries and before/after charts use the existing comparison services. Experiment history records the selected intervention kind, changed field/value, scenario, run fingerprints, trace evidence when applicable, and base-profile snapshot.
- The two actions are displayed in a compact responsive grid, stacking on narrow panels.

## Deterministic fixture evidence

A seeded 10-second POC fixture under 5× traffic selected PostgreSQL based on measured component service-time evidence. Reducing its modeled mean service time from 30 ms to 24 ms produced these fixture results:

| Metric | Before | After |
|---|---:|---:|
| Successful p95 latency | 231.38 ms | 171.54 ms |
| Dropped requests | 467 | 18 |
| Successful throughput | 201.1 req/s | 246.0 req/s |
| Success rate | 81.5% | 99.29% |

These values document this deterministic automated test fixture only. They are not a general claim that service-time tuning will yield these gains in other models or live systems.

## Tests

All listed commands passed with zero failures:

| Command group | Passed | Failed |
|---|---:|---:|
| Focused service-time/capacity/history tests | 31 | 0 |
| Simulation suite | 84 | 0 |
| Simulation guidance | 35 | 0 |
| POC template/UI | 13 | 0 |
| OpenAPI/SQL artifact generation | 11 | 0 |
| Workbench UI/persistence tests | 32 | 0 |
| Workbench validation | 25 | 0 |
| Workbench format/persistence | 22 | 0 |
| Collaboration sync | 35 | 0 |
| Browser-verification server protocol | 6 | 0 |

Counts overlap because the command groups intentionally run several common test files. The nine broad command groups amount to 263 test executions; the 31 focused executions overlap those broad groups.

The changed JSX passed a TypeScript transpiler syntax check.

## Build and browser status

- **Production build: not verified.** `npm run build` stops during `prebuild`; the current worktree lacks `node_modules/@excalidraw/excalidraw/dist/prod/fonts`, so Vite does not start.
- **Real-browser UI verification: not run.** The new buttons/layout and their complete in-browser interaction should be checked after dependency restoration.
- ZIP integrity should be checked after packaging.

## Changed files

- `src/features/simulation/experiments/simulationExperimentModel.js`
- `src/features/simulation/experiments/SimulationExperimentPanel.jsx`
- `src/styles/workbench.css`
- `tests/service-time-improvement.test.js` (new)
- `tests/simulation-experiment-model.test.js`
- `tests/capacity-improvement-comparison.test.js`
- `tests/workbench-poc-ui.test.js`
- `package.json`
- `README.md`

## Next step

Restore locked dependencies and verify the production build and browser workflow. The next distinct optimization hypothesis should model database-specific write-contention/query assumptions explicitly, rather than conflating them with generic mean service time.
