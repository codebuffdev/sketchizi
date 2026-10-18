# Sketchizi Engineering Workbench — Simulation Comparison 0.12

## Summary

Prototype 0.12 adds an all-scenario comparison and cross-scenario explanation layer to the existing Sketchizi-owned simulation workflow. It is inspired by good simulation tooling, not a Breakscale clone: no Breakscale UI is copied, and the existing Sketchizi Workbench model, React/Excalidraw foundation, and SimIR adapter remain the source of truth.

## Download

- Source ZIP: `sketchizi-engineering-workbench-simulation-comparison-prototype-0.12.zip`
- In-project specification: `docs/SIMULATION_COMPARISON_EXPLANATIONS_0.12.md`

## What changed

- A pure `buildScenarioComparisonOverview(...)` helper assembles comparisons across all completed scenarios.
- Scenario summary compares success rate, successful throughput, p95 successful latency, request drops, and deltas from baseline.
- Component-level table maps per-run runtime measurements back to source Workbench entity IDs and includes utilization, drops, failures, arrivals, queue-wait p95, and service-time p95.
- Cross-scenario insights flag modeled regressions in drops, latency, and success rate and link to relevant canonical entities when evidence supports it.
- Selecting an insight opens its scenario and focuses the related Workbench component.

## Verification results

- Full Node test suite: **243 passed, 0 failed**.
- Focused simulation suites passed, including the new cross-scenario comparison test.
- `node --check` passed on the modified plain JavaScript helper and test file.
- ZIP integrity check passed after packaging.

## Not verified

The Vite production build and real-browser UI behavior have not been verified. `npm run build` stops in `prebuild` because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is missing. This is an incomplete-dependency environment; no claim of a successful production build is made.

## Product/roadmap note

This is an explanation and comparison layer over synthetic model results, not a claim of live-system insight or causal analysis. Durable experiment history remains future work. OpenAPI and SQL generation remain paused until the simulation experience is verified in the browser and its outputs are reproducible and explainable.
