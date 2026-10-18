# Sketchizi Workbench 0.23 — Database Write-Contention Experiments

## Summary

This iteration adds a database-specific controlled experiment alongside the existing capacity and mean-service-time trials. It reduces only the PostgreSQL profile's modeled `writeContentionMs` assumption by 20%, then reruns the same selected non-outage scenario with the same seed, duration, traffic multiplier, model and other profile values.

The control is intentionally evidence-gated: a usable trial requires both a typed `Writes to` relationship in the current model and event-derived evidence from the selected scenario that write operations started and non-zero modeled write-contention overhead was applied. A read-only model is not treated as if it has writes.

## Changes

- Bumped the deterministic simulation engine to `0.4.0` and result schema to `4` for the additional database operation evidence.
- Captured database read/write operation counts and the sum of applied modeled write-contention overhead in per-component output.
- Added `operation` and `writeContentionMs` to serviced database request trace hops. Read, dropped and unavailable operations do not claim positive write-contention time.
- Added `createDatabaseContentionImprovementProfile`, which clones the base profile, reduces only `writeContentionMs`, leaves the canonical Workbench model and saved base profile unchanged, and records the hypothesis/evidence for history.
- Added a collapsible **PostgreSQL write-contention hypothesis** action so the new control does not clutter the main capacity/service-time improvement choices.
- If no write operation with non-zero modeled contention overhead was recorded, the control explains what is missing. Existing read-only POCs continue to run and are not silently reinterpreted as write workloads.
- Added `npm run test:database-contention-improvement` and included the new tests in `npm run test:simulation`.

## Deterministic synthetic fixture

A seeded 10-second mixed read/write POC under 5× traffic recorded 192 database write operations with 2,880 ms of total applied contention overhead. Changing the per-write assumption from 15 ms to 12 ms yielded the following results in that test fixture:

| Metric | Before | After |
|---|---:|---:|
| Successful-request p95 latency | 244.18 ms | 240.46 ms |
| Dropped requests | 578 | 562 |
| Successful throughput | 190.1 req/s | 191.6 req/s |
| Success rate | 77.10% | 77.73% |

These are synthetic engine outputs for a deterministic fixture, not measurements of a deployed database or guarantees of real-world performance.

## Verification

The following 12 test command groups passed with zero failures. Counts are test executions per command and overlap; they are not unique test cases.

| Command group | Passed | Failed |
|---|---:|---:|
| Simulation suite (includes write-contention tests) | 89 | 0 |
| Simulation guidance | 35 | 0 |
| Workbench artifacts | 11 | 0 |
| Workbench POC/template | 13 | 0 |
| Workbench UI/persistence | 32 | 0 |
| Workbench validation | 25 | 0 |
| Workbench file format/persistence | 22 | 0 |
| Collaboration synchronization | 35 | 0 |
| Browser verification server protocol | 6 | 0 |
| Service-time improvement | 31 | 0 |
| Capacity improvement | 26 | 0 |
| Focused database-contention/engine/history | 25 | 0 |
| **Total test executions** | **350** | **0** |

- Modified JavaScript modules passed `node --check`.
- Modified React JSX passed a TypeScript transpiler syntax check.
- The final packaged ZIP is integrity-checked separately after packaging.

## Build and browser status

- **Production build: not verified.** `npm run build` stops in `prebuild` because this worktree does not have the installed Excalidraw font assets at `node_modules/@excalidraw/excalidraw/dist/prod/fonts`; Vite does not start.
- **Real-browser interaction: not verified.** Restore locked dependencies on a network-enabled machine, run the build, and exercise the new collapsible action in the Workbench before treating this as fully release-verified.

## Changed files

- `src/features/simulation/engine/runSimulation.js`
- `src/features/simulation/experiments/simulationExperimentModel.js`
- `src/features/simulation/experiments/traceInvestigation.js`
- `src/features/simulation/experiments/SimulationExperimentPanel.jsx`
- `src/styles/workbench.css`
- `tests/simulation-engine.test.js`
- `tests/simulation-experiment-model.test.js`
- `tests/database-contention-improvement.test.js` (new)
- `package.json`

## Next step

Verify the production build and browser workflow locally. The next distinct database capability should be an explicitly modeled query/index/lock hypothesis; it must not be conflated with this fixed per-write synthetic contention overhead.
