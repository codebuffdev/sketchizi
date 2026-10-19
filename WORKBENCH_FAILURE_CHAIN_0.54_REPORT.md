# Workbench 0.54 — Pairwise failure-chain experiments

## Delivered

- Added `runFailureChainMatrix` to run a baseline, individual outage runs, and combined pairwise outage runs at the same offered load.
- Compared each combined outage's modeled throughput loss with the stronger individual outage and classified the difference as worse, similar, lower-impact, or not comparable.
- Added a default maximum of 45 pair evaluations, explicit truncation reporting, validation for traffic multiplier and pair limit, and a blocker when fewer than two outage candidates exist.
- Added a UI action, result table, pair count, stale-result warning, and clear interpretation boundaries.
- Kept synthetic what-if findings separate from claims about actual cascading failures, recovery, failover, or production resilience.

## Verification completed

- `npm run test:simulation`: **142 tests passed, 0 failed**.
- Focused `tests/workbench-simulation-runner.test.js`: **19 tests passed, 0 failed**.
- Runner JavaScript syntax check: passed.
- ZIP integrity check: passed after packaging.

## Not verified in this environment

- Production Vite build, `npm run verify:workbench-release`, PostgreSQL integration, and rendered Chromium smoke test were not run. Dependencies are not installed in this environment.

## Interpretation limits

Pairwise outages are deterministic synthetic scenarios based on the existing simulation engine. Positive additional loss means the combined pair performs worse than the stronger individual outage in this model. It does not prove a real cascading failure, real failover behavior, recovery time, or production fault tolerance.
