# Sketchizi Engineering Workbench — Simulation Adapter Prototype 0.8

## Goal

Implement the next agreed milestone: a pure, deterministic adapter from the Workbench semantic model into a Sketchizi-owned, engine-neutral Simulation Intermediate Representation (SimIR). This is not a Breakscale clone. The implementation does not import Breakscale types, UI, or engine code. It is a projection boundary so an engine backend can be evaluated independently later.

## What was implemented

- Added `src/features/simulation/adapter/buildSimulationProjection.js`.
- Added `tests/simulation-projection.test.js` and `npm run test:simulation-projection`.
- Added implementation notes in `docs/SKETCHIZI_SIMULATION_ADAPTER_IMPLEMENTATION_0.1.md`.
- Preserved the baseline Workbench UI and document model; no new UI integration was added.
- Engine-neutral component kinds: traffic source, request service, relational store, message queue, message worker, and external-service approximation.
- Engine-neutral edge kinds: synchronous request, asynchronous enqueue, and queue consumption.
- Stable IDs and sorted projection output, semantic model fingerprint, separate profile fingerprint, model revision provenance, source relation maps, original relation orientation provenance.
- API endpoints resolve to one uniquely exposing REST service and are not emitted as separate runtime nodes.
- Reads and writes from the same caller to the same database are grouped into a single runtime hop.
- `subscribes` relationships compile into queue-to-worker consume flow while preserving the Workbench direction in provenance.
- Deployment, authentication, generic dependency relations remain explicit informational exclusions; freeform canvas layout and active view never affect simulation topology.
- Profile fields are explicit, range-checked, and unknown fields are blocked to catch misspellings.
- Ambiguous fan-out, synchronous cycles, unconfirmed marked assumptions, missing profiles, invalid scenarios, and broken references block compilation. No partial topology is returned when any blocker exists.

## Tests

`npm run test:simulation-projection`: **15/15 passed**.

`npm run test:workbench-validation`: **24/24 passed**.

`npm run test:workbench-format`: **21/21 passed**.

The adapter is pure JavaScript and its focused suite requires no additional external runtime dependency. Tests cover projection of the full-stack example, deterministic IDs/output, active-view independence, reorder-stable semantic fingerprint, missing/mismatched profiles, invalid parameter values and names, endpoint ownership resolution, grouped database edges, queue/worker direction and provenance, ambiguous branching, explicit required fan-out, external API approximation warning, synchronous cycles, and exclusion of deployment metadata.

## Important limitations

- This does not execute a simulator.
- It does not include or copy Breakscale engine code or UI.
- SimIR is not yet translated to a selected engine's native topology types.
- The adapter is not connected to the Workbench UI; users cannot yet configure profiles or launch experiments from Sketchizi.
- The full Vite production build and browser behavior are not verified here because the prior baseline dependency installation was incomplete. No production readiness claim is made.
- Simulation assumptions remain explicit; results must not be marketed as predictions of a live deployment without calibrated inputs and limitations.
- OpenAPI and SQL artifact generation remains paused until one end-to-end simulation has been run, measured, and explained.

## Next gate

Evaluate and isolate the engine backend integration behind SimIR. Before declaring the adapter integration complete, demonstrate a seeded scenario for client → service → database, reproduce identical results for identical inputs, increase offered traffic, inject a supported failure, and trace metrics back to model entities and relations. Keep Sketchizi's broader engineering-workbench roadmap independent of any one simulator.
