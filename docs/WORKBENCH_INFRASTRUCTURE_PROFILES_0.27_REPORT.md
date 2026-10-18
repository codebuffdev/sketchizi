# Sketchizi Workbench 0.27 — Infrastructure & Capacity Profiles

## Goal

Add a persistent, evidence-aware record of the infrastructure hosting runtime components so the Workbench can distinguish known deployment facts from assumptions before attempting calibrated capacity estimates.

## Implemented

- Added `infrastructureByEntityId` to the simulation profile.
- Added REST service fields for platform, deployment mode, current replica count, vCPU and RAM per replica, autoscaling bounds/CPU target, worker-thread limit, request timeout, and maximum DB-pool connections per instance.
- Added PostgreSQL fields for hosting model, provider/service, instance class, engine version, vCPU, RAM, storage capacity/type/IOPS, maximum connections, read replicas, and high-availability mode.
- Every field keeps an evidence label: `deployment-configured`, `measured`, `user-estimated`, `defaulted`, or `unknown`.
- Unknown hardware values are initialized as empty/unknown; the code does not invent instance counts, vCPU, RAM, storage, or database limits.
- Older simulation profiles are migrated in memory by backfilling missing infrastructure fields while retaining existing recorded values. Saving the profile persists the migrated data in the Sketchizi Workbench document.
- Infrastructure metadata is included in simulation-profile fingerprints, staleness checks, saved run history, and historical run display.
- Infrastructure-only edits do not automatically reset acknowledgement of unrelated synthetic workload assumptions. Results are cleared after profile edits; historical runs retain their original infrastructure evidence.
- Added `npm run test:infrastructure-profiles`.

## Important modeling boundary

This increment **does not use infrastructure values to calculate request capacity**. vCPU/RAM, replicas, connection limits, IOPS, and autoscaling data are descriptive deployment context at this stage. Changing them does not change synthetic throughput, service time, queueing, or drop counts. The UI says this explicitly. Capacity math should only consume these fields after a calibrated model and its validation criteria have been designed.

The profile is user-entered; Sketchizi does not discover a live hosting provider's tier or query monitoring APIs. Mark values as measured only when they have been checked against metrics or load tests.

## Verification in this environment

- Infrastructure profiles + Workbench document persistence: **7 passed, 0 failed**.
- Simulation regression suite: **107 passed, 0 failed**.
- Workbench artifact generation: **11 passed, 0 failed**.
- Workbench format/persistence: **22 passed, 0 failed**.
- Workbench UI/model: **32 passed, 0 failed**.
- Workbench validation: **25 passed, 0 failed**.
- Workbench POC: **13 passed, 0 failed**.
- Browser verification server: **6 passed, 0 failed**.
- Browser index fixture: **1 passed, 0 failed**.
- The changed JSX file parsed with the available TypeScript TSX parser.

These are test executions across individual suites; counts are not a count of unique tests. The actual React UI was not opened in a real browser during this iteration.

## Existing release-gate limitations

This extracted package has no installed `node_modules`. The prior Workbench release gate also remains open: dependency installation was blocked by package-registry DNS (`EAI_AGAIN`), and the previous build attempt stopped in `prebuild` because the Excalidraw font assets were absent. This iteration does not claim production build or real-browser verification.

## Manual verification on Windows

From the extracted `sketchizi-main` directory:

```powershell
npm ci
npm run build
npm run test:infrastructure-profiles
npm run test:simulation
npm run test:browser-index-fixture
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-workbench-browser.ps1
```

In the app, prepare/open the POC, expand **Infrastructure & capacity profiles**, enter only values you can verify, select the evidence source for each populated field, save, reopen the `.sketchizi` file, run a baseline/5× comparison, and reopen the saved run. Confirm that the infrastructure values survive both document reload and historical-run reopening, and verify that changing them does not silently change simulator capacity results in this milestone.

## Next step

Phase 2 establishes the data contract. Phase 3 should define and test calibration from representative load tests, then use resource limits only where a documented mapping to model capacity exists. Do not derive exact requests-per-second from vCPU/RAM alone.

Application package version remains 1.10.86; 0.27 is a Workbench prototype milestone, not an application release version.
