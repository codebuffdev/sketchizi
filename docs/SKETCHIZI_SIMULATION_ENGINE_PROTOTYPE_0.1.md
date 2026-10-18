# Sketchizi Engineering Workbench — Simulation Engine Prototype 0.1

## Purpose

This iteration adds a small Sketchizi-owned deterministic discrete-event engine behind the engine-neutral SimIR adapter. Breakscale is a reference for engineering ideas, not a codebase or UI to clone. This prototype does not import or copy its UI or simulation engine.

The goal is to prove one narrow vertical slice: a seeded client generates requests → one REST service processes them → PostgreSQL processes the dependency call. The same projection can run baseline, traffic-surge and database-outage experiments.

## Run the tests and example

From the `sketchizi-main` directory:

```powershell
npm run test:simulation
npm run example:simulation
```

The example prints machine-readable results for three scenarios. It uses the Workbench adapter and simulation engine directly, so these commands do not require a Vite browser build or Excalidraw fonts. This does not substitute for the outstanding production build/browser verification.

## Engine behavior in v0.1

- Seeded pseudo-random sequence for repeatable runs.
- Poisson-distributed arrivals over the configured observation window.
- Log-normal service-time variability derived from configured mean and coefficient of variation.
- Finite concurrency, FIFO waiting buffers, and bounded queue drops.
- Service/database operation failures through explicit probabilities.
- Hard-outage experiment override for a processing node; a request fails when it reaches that dependency, without consuming its processing capacity.
- PostgreSQL read/write operation selection and additional configured write contention when a grouped edge carries both read and write semantics.
- Successful/failure/drop counts, success rate, completions within the observation window, throughput, terminal and successful latency percentiles, per-node queue/service metrics, utilization, and per-edge request counts.
- Provenance includes model/profile fingerprints, engine version, scenario seed, override configuration, and a run fingerprint.

Latency percentiles use the nearest-rank method. Throughput counts successful completions inside the observation window; requests arriving inside the window may drain after it closes. Total terminal counts include drained requests, and `drainDurationMs` exposes the extra time needed to finish the workload.

## Deliberately blocked in v0.1

- Async queues/workers and background job scheduling.
- More than one synchronous successor (routing or multi-target fan-out).
- Non-zero request timeouts and retries; cancellation and retry semantics are not modeled yet.
- Recursive synchronous request cycles.
- Detailed protocols, caches, network transfer, autoscaling, replica topology, and real provider/database internals.

Unsupported scenarios return blockers rather than a topology/metrics result. External APIs are generic approximations, not provider performance measurements. Simulation outputs are conditional on the chosen assumptions, not predictions or observations of a deployed production system.

## Example output observed in this run

Configuration: seed 211, 15-second observation window, 50 RPS offered baseline, service concurrency 8, database concurrency 6. These are illustrative assumptions only.

| Scenario | Offered | Successful | Failed | Dropped | Successful throughput within window | Database utilization |
|---|---:|---:|---:|---:|---:|---:|
| Baseline | 736 | 736 | 0 | 0 | 48.9333 RPS | 0.2548 |
| 5× traffic | 3,842 | 2,874 | 0 | 968 | 188.8667 RPS | 0.9972 |
| Database outage | 736 | 0 | 736 | 0 | 0 RPS | 0 |

In the baseline, successful-request p95 latency was 72.293 ms. Under 5× traffic, the p95 of successful requests rose to 246.7307 ms and 968 requests were dropped by the modeled finite database buffer. With the hard database outage, all 736 offered requests failed when reaching the database and database utilization was zero. These values are from a deterministic illustrative model, not benchmark data from a live service.

## Tests

`npm run test:simulation-engine`: 10 tests passed.
`npm run test:simulation-projection`: 15 tests passed.
`npm run test:workbench-validation`: 24 tests passed in this worktree.
`npm run test:workbench-format`: 21 tests passed.
`npm run test:sync`: 35 tests passed.
`npm run test:recovery`: 1 test passed.

The engine tests include seeded determinism, overload pressure, operation failure, hard outage, invalid overrides, unsupported timeout/retry/async routing, unsupported fan-out, and request safety limits.

## Build status and next gate

The production Vite build was attempted and fails in the `prebuild` script because this worktree lacks `node_modules/@excalidraw/excalidraw/dist/prod/fonts`; `npm ci` is needed to restore dependencies and font assets. There is no claim of a verified UI build or browser interaction.

Next, improve the scenario/result review contract and add model-linked explanations, then consider the queue/worker event model. Do not resume OpenAPI or SQL generation until a complete seeded simulation has been measured and explained end to end. OpenAPI/SQL remain paused, not cancelled.
