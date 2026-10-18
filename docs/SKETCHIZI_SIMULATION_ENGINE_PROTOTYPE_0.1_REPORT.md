# Sketchizi Engineering Workbench — Simulation Engine Prototype 0.9

## Summary

Implemented a narrow, Sketchizi-owned deterministic discrete-event simulation engine behind the existing engine-neutral SimIR projection. This is an original Sketchizi engine, not a Breakscale UI or engine clone. Breakscale was used as a reference for simulation concepts; this prototype imports no Breakscale code.

The original stable Sketchizi 1.10.86 ZIP remains untouched. This prototype ZIP is based on the isolated Workbench/adapter 0.8 worktree. The new engine is pure JavaScript and is not yet connected to the visible Workbench UI.

## What is included

- `src/features/simulation/engine/runSimulation.js`: deterministic, bounded discrete-event engine v0.1.
- `tests/simulation-engine.test.js`: focused behavior tests.
- `examples/simulation/client-api-postgres.mjs`: runnable full-stack example.
- `docs/SIMULATION_ENGINE_EXAMPLE_RUN_0.1.json`: generated output from the example run.
- `docs/SKETCHIZI_SIMULATION_ENGINE_PROTOTYPE_0.1.md`: scope, assumptions, sample metrics and run instructions.
- `npm run test:simulation` and `npm run example:simulation` scripts.

## Engine behavior

The engine generates seeded Poisson arrivals from configured traffic sources, samples log-normal service times from a mean and coefficient of variation, models finite concurrency and FIFO bounded buffers, and records failures/drops. It models relational-store read/write behavior and configured write contention. It supports operation-level failure probabilities and an explicit hard-outage experiment override for a processing node.

Results include offered/successful/failed/dropped request counts, success rate, successful completions within the observation window, throughput, latency percentiles, per-node queue/service metrics and utilization, per-edge request counts, bottleneck signals, fingerprints, seed and assumptions/overrides. The run drains in-flight requests after the observation window; `drainDurationMs` reports the additional time. Throughput counts successful completions inside the observation window, while terminal request counts include drained requests.

## Sample deterministic experiment

Configuration: seed 211, 15-second observation window, baseline offered rate 50 RPS, REST service concurrency 8, database concurrency 6. Values are illustrative assumptions, not benchmark data.

| Scenario | Offered | Successful overall | Failed | Dropped | Successful throughput within window | DB utilization |
|---|---:|---:|---:|---:|---:|---:|
| Baseline | 736 | 736 | 0 | 0 | 48.9333 RPS | 0.2548 |
| 5× traffic | 3,842 | 2,874 | 0 | 968 | 188.8667 RPS | 0.9972 |
| Database hard outage | 736 | 0 | 736 | 0 | 0 RPS | 0 |

Baseline successful-request p95 latency is 72.293 ms. Under 5× traffic, successful-request p95 latency rises to 246.7307 ms while the modeled database saturates and 968 requests are dropped. With the database hard outage, all requests fail on reaching the unavailable database; modeled database utilization is zero. Results are entirely conditional on configured assumptions and are not predictions of a live environment.

## Explicit limitations

Engine v0.1 deliberately blocks rather than guesses for:

- asynchronous queues/workers and message scheduling;
- more than one synchronous successor (routing and fan-out);
- non-zero timeouts and retries;
- synchronous cycles;
- unsupported node/edge kinds and invalid scenario parameters.

API endpoints remain contract metadata. Deployment metadata does not become request flow. External APIs remain explicit generic approximations. Network transfer, cache behavior, autoscaling, multiple replicas, protocol-level behavior, and database internal algorithms are not modeled yet.

The Workbench UI has not been wired to launch experiments or edit profiles. The production Vite build and browser UI are not verified: the current worktree fails during `prebuild` because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is missing. Run `npm ci` before attempting a build on a connected local environment.

## Test results

- `npm run test:simulation`: **25 passed** (15 projection + 10 engine), 0 failed.
- `npm run test:simulation-projection`: **15 passed**, 0 failed.
- `npm run test:workbench-validation`: **24 passed**, 0 failed.
- `npm run test:workbench-format`: **21 passed**, 0 failed.
- `npm run test:sync`: **35 passed**, 0 failed.
- `npm run test:recovery`: **1 passed**, 0 failed.
- JavaScript syntax checks for the engine and runnable example passed.
- `npm run example:simulation` completed and emitted the documented baseline, traffic surge, and hard-outage result sets.

## Next milestone

Add a result explanation contract that maps each metric/bottleneck to SimIR nodes, source Workbench entities, and source relationships; then wire profile editing and a Run Experiment UI into the Workbench. Expand queue/worker simulation only after defining explicit enqueue, dequeue, consumer scheduling and backlog semantics. OpenAPI/SQL generation remains paused until the first end-to-end simulation can be run and explained through the product workflow.
