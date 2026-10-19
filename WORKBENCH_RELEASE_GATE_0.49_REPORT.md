# Sketchizi Workbench 0.49 — Repeat-run evidence at tested load levels

## Goal

Extend the measured operating envelope with repeat-run summaries so teams can see whether a load level has been observed once or multiple times, and inspect the recorded ranges for p95 latency, failed-request rate, and successful throughput.

## Implemented

- Grouped measured points by the existing 10% offered-load grouping tolerance within each exact target environment.
- Added per-load-level run counts and min/max ranges for p95 latency, error rate, and throughput.
- Explicitly distinguishes repeated observations from single observations.
- Does not invent a variability threshold, call measurements statistically stable, or change the SLO pass/fail assessment.
- Added a responsive repeat-run evidence section to the operating-envelope UI.
- Added regression coverage for repeated and single-observation load levels and metric ranges.

## Modeling boundary

These are descriptive ranges over the supplied records, not confidence intervals or statistical significance tests. Run durations, workload mix, environment drift, warm-up, and measurement methodology can affect the range. A repeated level does not by itself establish reproducibility.

## Verification

Focused test command: `node --test tests/load-test-calibration.test.js`.

The full release gate and real-browser verification have not been run for 0.49 in this environment. Run `npm run verify:workbench-release` on the network-enabled Windows machine.

## Suggested Git commit

`feat(workbench): summarize repeat-run load-test evidence`
