# Sketchizi Workbench 0.50 — Relative repeat-run spread

## Goal

Make repeated load-test measurements easier to compare by showing each metric's observed range and its spread as a percentage of the median for that load level.

## Implemented

- Added median and `spreadPercentOfMedian` to repeat-run metric summaries for p95 latency, failed-request rate, and throughput.
- Displayed relative spread alongside observed min/max ranges in the measured operating envelope.
- Defined zero-median behavior: zero spread reports 0%; a nonzero spread with a zero median reports unavailable rather than infinity.
- Kept all measurements isolated by exact target environment and existing offered-load grouping tolerance.
- Kept SLO pass/fail and highest-observed-passing calculations unchanged.
- Clarified in code that relative spread is descriptive, not a confidence interval or statistical stability claim.
- Added regression coverage for median-relative spread and zero-median handling.

## Verification

- `node --test tests/load-test-calibration.test.js` — PASS, 19/19 tests.
- Full release gate, production build, PostgreSQL integration, and Chromium UI verification have not been run for 0.50 in this environment.

## Suggested Git commit

`feat(workbench): show median-relative spread for repeated load tests`
