# Sketchizi Workbench 0.48 — Evidence-based measured operating envelope

## Goal

Use user-defined service-level objectives (SLOs) to summarize load-test points that have actually been measured. This extends the Phase 3 load-test evidence workflow without deriving capacity from vCPU/RAM or extrapolating beyond observed data.

## Implemented

- Added `assessObservedOperatingEnvelope()` to evaluate each complete load-test record against an explicit p95 latency target and failed-request-rate target.
- Records remain grouped by exact target-environment identifier; evidence from different deployments is never combined.
- Shows the highest offered-load point that met both targets and, where present, the next higher failing point.
- Lists each tested point as pass/fail and retains its measured latency/error details.
- Missing or invalid SLO thresholds do not produce a capacity assessment. Incomplete records are excluded from the envelope.
- Added a Workbench UI section with blank-by-default SLO fields. The user must enter targets rather than inheriting an invented service-level objective.
- Added regression tests for threshold validation, separate environments, passing/failing points, and non-extrapolation wording.

## Modeling boundary

The highest passing point is an observed test result, not guaranteed sustainable production capacity. It is not interpolated or extrapolated. Test duration, workload mix, ramp-up, warm-up, topology, measurement quality, and resource contention still matter. Infrastructure metadata remains descriptive; this feature does not derive throughput from CPU, RAM, replica counts, or database limits.

## Verification performed

- `node --test tests/load-test-calibration.test.js`: **17 passed, 0 failed**.
- Full release gate and real-browser verification have not been rerun for 0.48 in this environment. Run `npm run verify:workbench-release` on the user's Windows machine after extracting the ZIP.

## Suggested Git commit

`feat(workbench): assess measured operating envelope against SLOs`
