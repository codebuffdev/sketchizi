# Workbench Simulation Outcome Clarity 0.26

## Goal

Complete the first Phase 1 trustworthiness pass before adding further simulation hypotheses. Preserve the existing aggregate counts while making the kind of failure and the observation-window boundary visible.

## Changes

- Upgraded the synthetic simulation engine to 0.6.0 and result schema to 5.
- Added separate `dependencyUnavailableRequests` and `componentFailedRequests` counters; `failedRequests` remains their aggregate to preserve existing count accounting.
- Added the failure kind to sampled request traces so an unavailable dependency is displayed differently from a modeled component failure.
- Captured an `observationBoundary` snapshot at the end of the observation window, with active service, queued and total in-flight counts per runtime component.
- Exposed those point-in-time counts as result metrics and added an “In flight at window end” metric card.
- Added the always-visible “Uncalibrated synthetic model” notice. It explicitly states that instance/machine size and live resource usage are not discovered, and that current performance outcomes are what-if outputs driven by the displayed assumptions.
- Clarified that in-flight is a point-in-time subset that must not be added to final terminal outcomes; requests can complete during post-window drain.
- Clarified that non-zero timeout/retry settings remain blocked until timeout/cancellation and retry semantics exist.
- Improved the explanation card for PostgreSQL-unavailable scenarios: it now says the scenario explicitly made a dependency unavailable and that the result is not evidence about the live database.
- Added the `test:simulation-outcomes` script.

## Semantics

The accounting identities remain:

`offeredRequests = successfulRequests + failedRequests + droppedRequests`

`failedRequests = dependencyUnavailableRequests + componentFailedRequests`

`requestsInFlightAtWindowEnd = requestsQueuedAtWindowEnd + requestsInServiceAtWindowEnd`

The last value is a point-in-time count, not a fourth terminal outcome. The simulator continues to drain scheduled work after the observation window so final requests receive terminal outcomes; throughput is based on successful completions within the observation window.

## Verification

Verification executed:

- `npm run test:simulation` — **101 passed, 0 failed**.
- `npm run test:request-traces` — **25 passed, 0 failed**, including static UI assertions for the model disclaimer and in-flight table.
- `npm run test:simulation-outcomes` — **36 passed, 0 failed**.
- `npm run test:workbench-ui` — **32 passed, 0 failed**.
- `npm run test:workbench-artifacts` — **11 passed, 0 failed**.
- `npm run test:workbench-format` — **22 passed, 0 failed**.
- `npm run test:workbench-validation` — **25 passed, 0 failed**.
- `npm run test:browser-verification-server` — **6 passed, 0 failed**.
- `npm run test:browser-index-fixture` — **1 passed, 0 failed**.
- TypeScript's parser/transpiler accepted the edited JSX and JavaScript files.

The production build and real-browser verification remain unverified here. Workbench 0.25's existing environment blockers remain relevant: registry DNS prevented dependency installation (`EAI_AGAIN`), the available package-check directory has no `node_modules`, and the earlier build attempt stopped before Vite because Excalidraw font assets were absent. Do not describe this milestone as browser-verified until build and manual UI checks pass on a fully installed environment.

## Not included

This milestone does not add infrastructure sizing, autoscaling, machine CPU/RAM modeling, live metrics ingestion, real PostgreSQL connection/pool modeling, or workload calibration. Those remain the next phases after release verification.
