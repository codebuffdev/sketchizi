# Workbench 0.53 — Component outage resilience matrix

## Delivered

- Added `runResilienceMatrix`, which compiles the Workbench model and runs a baseline plus one single-component outage scenario for each supported REST service, PostgreSQL database, or external API included in the compiled request path.
- Applies each outage at the same modeled offered load and compares the result with the baseline.
- Reports scenario throughput, throughput loss where calculable, p95 latency, and modeled failed-request rate.
- Ranks completed scenarios by modeled throughput loss; scenarios without a calculable loss are not assigned an invented score.
- Added a Workbench UI action and result table with a stale-result warning when the model, profile, or active scope changes.
- Added tests for deterministic scenario results, supported target coverage, invalid traffic levels, UI presence, and stale-result warning.

## Verification completed

- `npm run test:simulation`: **138 tests passed, 0 failed**.
- `node --test tests/workbench-simulation-runner.test.js tests/traffic-sweep-ui.test.js`: **19 tests passed, 0 failed**.
- JavaScript runner syntax check: passed.
- ZIP integrity check: passed after packaging.

## Not verified in this environment

- Production Vite build and full `npm run verify:workbench-release` were not run because dependencies are not installed in this container.
- Disposable PostgreSQL DDL integration and rendered Chromium browser smoke remain to be run on the user's Windows environment.

## Interpretation limits

The matrix is deterministic synthetic what-if analysis. It disables one modeled component at a time; it does not model correlated or cascading failures, automatic failover, recovery time, or real infrastructure behavior unless those behaviors are explicitly represented by the simulation engine. Throughput impact is not a production resilience guarantee. External API behavior remains an approximation.
