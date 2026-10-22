# Sketchizi Workbench 0.81 — Optimization Portfolio & Trade-off Analysis

## Product increment

- Keeps up to 12 completed controlled improvement trials in a panel-session portfolio.
- Ranks comparable trials with an explicit directional score: equal-weight average of available relative changes for successful throughput, p95 latency, dropped requests, and success rate. Positive is better; negative is worse.
- Displays per-trial directional changes and the failed-request-rate proxy delta in percentage points.
- Omits unavailable metrics instead of inventing values and ignores incomplete comparisons.
- Offers a clear-portfolio action. Existing saved experiment history remains separate.
- Calls out that these are synthetic controlled what-if results and that the failure-rate proxy is not a validated SLO/error-budget calculation.

## Verification

- `node --test tests/optimization-portfolio.test.js tests/simulation-optimization-recommendations.test.js`: passed.
- `npm run test:simulation`: 174 passed.
- `npm run test:workbench-format`: 22 passed.
- `npm run test:workbench-artifacts`: 11 passed.
- `npm run check:package-lock-consistency`: 19/19 passed.
- Production Vite build and real browser interaction were not run; do not treat them as verified.
