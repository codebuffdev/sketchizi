# Sketchizi Workbench 0.79 — SLO Headroom and Error-Budget Analysis

## Goal

Return focus to core Workbench capabilities by making traffic-sweep results easier to interpret against the user's configured latency and error-rate SLOs.

## Implemented

- Added a pure helper, `calculateSloBudgetMetrics`, for per-scenario SLO headroom calculations.
- Traffic-sweep points now include latency headroom in milliseconds and percent, error-budget remaining in percentage points and percent, percent of budget used, and a budget state.
- The traffic-sweep table displays p95 headroom and error-budget remaining alongside existing throughput, latency, failed-request rate, and SLO status.
- Negative latency headroom means the p95 target was exceeded. Negative remaining error budget means the observed error rate exceeded the configured allowance.
- A zero-percent error target is handled explicitly. Percentage-used/remaining values are left unavailable because dividing by a zero budget would be misleading; the report still says whether the target was met.
- Incomplete runs, missing targets, and invalid thresholds remain unevaluated rather than receiving invented metrics.
- Because the new fields are part of the traffic-sweep result, they are included in the existing evidence JSON export.

## Verification

- Focused SLO helper, simulation runner, and traffic-sweep UI tests: **30 passed**.
- Full simulation regression suite: **168 passed**.
- Workbench document format/persistence tests: run separately in this release package.
- Production build and real-browser execution: not run in this environment.

## Interpretation boundary

This is arithmetic over the synthetic traffic-sweep outputs and user-configured SLO thresholds. It does not estimate an operational or calendar-based error budget and does not claim production reliability. Measured load-test evidence remains separate from synthetic simulation output.

## Suggested commit

`feat(workbench): show SLO headroom and remaining error budget`
