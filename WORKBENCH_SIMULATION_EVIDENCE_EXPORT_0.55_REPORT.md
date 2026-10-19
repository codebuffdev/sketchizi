# Sketchizi Workbench 0.55 — Simulation evidence JSON export

## Delivered

- Added a versioned, portable JSON evidence report for traffic sweeps, single-component resilience matrices, and pairwise failure-chain matrices.
- Each results section now offers **Export evidence JSON**.
- Reports retain experiment status, model/profile provenance, source-model snapshot, profile assumptions, aggregate baseline/scenario metrics, SLO classifications, pairwise interaction measurements, and diagnostics.
- Per-request traces and engine-internal result objects are intentionally omitted to keep exports bounded and reviewable.
- Export metadata states that results are synthetic, and that unmodeled recovery, failover, retries, and cascading behavior must not be inferred.
- Added unit tests for report schema, metric/provenance preservation, omitted internals, limitations, and invalid input; added UI source checks and wired the tests into the simulation test scripts.

## Verification performed

- `node --test tests/simulation-evidence-report.test.js tests/traffic-sweep-ui.test.js tests/workbench-simulation-runner.test.js` — passed (27 tests).
- `npm run test:simulation` — passed (146 tests).
- Production Vite build, full release gate, PostgreSQL integration, and rendered Chromium smoke were not run in this environment. Do not treat this feature ZIP as a passed release gate.

## Suggested commit

`feat(workbench): export simulation evidence reports as JSON`
