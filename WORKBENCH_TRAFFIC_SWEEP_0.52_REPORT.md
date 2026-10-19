# Workbench 0.52 — Deterministic traffic sweep

## Delivered

- Added `runTrafficSweep`, which compiles the Workbench model once and evaluates six deterministic offered-load multipliers (1×, 2×, 3×, 5×, 8×, 10×) using the existing simulation engine.
- Added explicit SLO evaluation only when both the p95 latency and failed-request-rate targets are supplied.
- Added first sampled failing multiplier and nearest prior passing multiplier summaries without interpolating an untested capacity threshold.
- Added a Workbench UI control and result table with offered requests, successful throughput, p95 latency, failed-request rate, and SLO outcome.
- Added stale-result warning when model/profile or SLO targets change.
- Added regression tests for determinism, ordering, target omission, invalid multipliers, and first-failure interpretation.

## Focused test results

`node --test tests/workbench-simulation-runner.test.js`: 14/14 passed.

## Verification limitations

The full release gate, production Vite build, disposable PostgreSQL DDL integration, and rendered Chromium UI smoke were not run in this environment. These remain required before declaring 0.52 fully verified.

## Safety and interpretation

The sweep produces synthetic model outputs. A passing point does not guarantee production capacity, and the actual failure threshold is not inferred between sampled multipliers. Failed-request rate uses modeled failed requests divided by offered requests; dropped requests remain separately reported by the simulation engine.
