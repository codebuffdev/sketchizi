# Sketchizi Workbench 0.28 — Load-test evidence & calibration workflow

## Goal

Establish an evidence-backed path between synthetic simulations and measurements from a real deployment, without implying that machine specifications alone determine capacity.

## Implemented

- Added document-persisted `loadTestEvidence` records with a schema version, test name/date, stable target-environment identifier, evidence source, workload duration/offered RPS/concurrency, observed successful throughput, end-to-end p95 latency, failed/timed-out request rate, REST CPU/memory, database CPU/connections/query p95, and optional component-level mean service times plus sample counts.
- Added manual data entry and JSON import using the Sketchizi load-test schema. This does not directly parse arbitrary raw k6/JMeter CSV or provider-specific JSON; source output must be mapped to the supplied template first. The starter template uses empty measurement values so it cannot be mistaken for an actual load test. Import validation checks dates, environment/source metadata, numerical ranges, component sample counts, and record limits.
- Preserved measurements in the Workbench document profile and simulation-history snapshots. Adding measurement evidence alone does not make a prior synthetic run stale; changing simulation or infrastructure inputs still follows existing staleness behavior.
- Added a selected-record comparison against a completed current or historical simulation result for offered load, observation duration, successful throughput, p95 latency, and failed-request rate.
- Comparisons are marked non-comparable when offered load differs by more than 10% or test duration differs by more than 25%. Missing core measurements produce a partial/incomplete comparison. The reason text calls out workload and duration differences.
- Kept simulator-only dropped-request rate separate from a load test's measured HTTP/error rate. They are different signals and are not treated as interchangeable.
- Added a cross-load evidence readiness assessment. It requires at least three tests with throughput, p95 latency and error-rate data across at least two offered-load levels. The status says the evidence is enough to assess behavior across loads, not that the model is certified.
- Added reviewable `meanServiceMs` proposals only when the same target environment has at least three repeated component-level measurements across at least two distinct offered-load levels. REST proposals require exclusive server-side processing time excluding queue/dependency wait; PostgreSQL proposals require mean query execution/service time with waits excluded unless explicitly modeled. Proposed values are sample-count-weighted means.
- Proposals apply only after explicit user action. The changed assumption remains `proposed`, results are cleared for rerun, and the user must save/review/confirm the assumption. No CPU/RAM-to-RPS conversion, automatic certification, live provider discovery, or automatic production-capacity claim was added.

## Model boundaries

- The simulator is still a synthetic discrete-event model. Its CPU, RAM, disk IOPS, autoscaling and connection-profile fields do not independently change capacity math.
- End-to-end p95, throughput and error rate are useful for comparison, but they do not uniquely reveal component service time. A service-time proposal is possible only with measurements explicitly tied to that component and with documented timing semantics.
- Current comparison checks offered load within 10% and observation duration within 25%. Even a passing comparison needs review of metric definitions, environment topology, warm-up/ramp-up, test mix, caching, and resource contention.
- Resource measurements are shown as context only because the simulator does not emit equivalent live CPU/memory/database telemetry.

## Verification

- `npm run test:load-test-calibration`: 10 passed, 0 failed.
- `npm run test:simulation`: 119 passed, 0 failed.
- `npm run test:infrastructure-profiles`: 9 passed, 0 failed.
- `npm run test:workbench-artifacts`: 11 passed, 0 failed.
- `npm run test:workbench-format`: 22 passed, 0 failed.
- `npm run test:workbench-ui`: 32 passed, 0 failed.
- `npm run test:workbench-validation`: 25 passed, 0 failed.
- `npm run test:workbench-poc`: 13 passed, 0 failed.
- `npm run test:browser-verification-server`: 6 passed, 0 failed.
- `npm run test:browser-index-fixture`: 1 passed, 0 failed.
- The modified JSX and JavaScript files parsed through the available TypeScript transpiler's syntax parser.

Counts are executions in individual suites, not a deduplicated overall test count. The browser fixture is a test harness; the full React UI was not exercised in a real browser for this iteration.

## Remaining release gate

`npm run build` was attempted and remains blocked in `prebuild`: `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is missing because dependencies are not installed in this extracted environment. Earlier `npm ci` attempts were blocked by package-registry DNS (`EAI_AGAIN`). Do not treat this increment as production-build or real-browser verified.

## Manual verification on Windows

From the extracted `sketchizi-main` directory:

```powershell
npm ci
npm run build
npm run test:load-test-calibration
npm run test:simulation
npm run test:workbench-artifacts
npm run test:workbench-format
npm run test:workbench-ui
npm run test:workbench-validation
npm run test:workbench-poc
npm run test:browser-index-fixture
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-workbench-browser.ps1
```

In Sketchizi, prepare the POC, enter or import real measurement records from the same target environment at more than one load level, save the profile, save/reopen the `.sketchizi` document, run a comparable simulation scenario, and compare the active result with a selected test record. Verify that load/duration mismatches are disclosed. Only enter component-level mean service times when their measurement source and timing boundaries match the simulator parameter definition. Inspect any proposal, apply it explicitly, save/review the assumption, and rerun before interpreting differences.

## Next step

Close the build and real-browser release gate. Then use a representative real load-test dataset to check whether the comparison and per-component service-time proposal are useful. Do not expand the calibration parameter set until the measurement definitions and model mapping for each added parameter can be independently justified.

Application package version remains 1.10.86; 0.28 is a Workbench prototype milestone, not an application release version.
