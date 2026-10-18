# Sketchizi Model-to-Simulation Adapter — Implementation 0.1

**Status:** Pure adapter prototype; not integrated into the Workbench UI and not yet connected to a simulation engine.

## Product boundary

Sketchizi is not a Breakscale clone. This prototype reuses only the general idea of modeling runtime behavior and measuring deterministic experiments. The adapter creates a Sketchizi-owned, engine-neutral Simulation Intermediate Representation (SimIR). It does not import Breakscale types, behavior classes, UI, or source code. A future engine backend can be evaluated independently, with license and behavioral tests, after the projection contract stabilizes.

## Location

- `src/features/simulation/adapter/buildSimulationProjection.js`
- `tests/simulation-projection.test.js`

Run focused tests:

```bash
npm run test:simulation-projection
```

## Input

`buildSimulationProjection({ workbench, simulationProfile, adapterVersion })`

The Workbench document provides semantic entities and typed relationships. The separate `simulationProfile` uses `schemaVersion: 1`, a `profilesByEntityId` record and `defaultScenario` containing positive integer `durationMs` and a safe-integer `seed`. Each runtime-capable entity requires a profile with an engine-neutral profile `kind` and a complete `parameters` object. Optional `assumptions[field]` entries that do not have `status: "user-confirmed"` block readiness.

## Output

The result has `status: "ready" | "blocked"`, `topology`, deterministic `nodeMap` and `edgeMap`, provenance fingerprints/revision, and sorted diagnostics. `topology` is always null when any blocker exists. The SimIR node/edge kinds are Sketchizi-owned, not Breakscale `NodeKind` names.

Every edge records the Workbench relation IDs and original source/target entity IDs. This matters when `subscribes` becomes a queue-to-worker runtime flow: the runtime direction changes, but provenance retains the original Workbench direction.

## Supported mappings in 0.1

| Workbench entity | SimIR node | Notes |
|---|---|---|
| `frontend.react-app` | `traffic-source` | Requires explicit `trafficRps` > 0 |
| `backend.rest-service` | `request-service` | Requires explicit capacity, timing, buffer, error, timeout and retry parameters |
| `data.postgresql-database` | `relational-store` | Requires explicit read fraction and write contention values |
| `messaging.queue` | `message-queue` | Requires explicit capacity, enqueue latency and failure probability |
| `backend.worker` | `message-worker` | Uses independent processing-time parameters; does not reinterpret job retry limit as request retries |
| `integrations.external-api` | `external-service-approximation` | Explicit approximation warning; not a live measurement of the provider |
| API endpoint | No node | Contract metadata; calls resolve through exactly one `exposes` owner |
| Deployment target | No node | Deployment metadata only in this adapter version |

Relationship mappings: `calls` is a synchronous request edge, `reads`/`writes` to the same store are grouped into one runtime hop, `publishes` creates an asynchronous enqueue edge, and `subscribes` creates a queue-to-worker consume edge. `exposes` resolves ownership but is not a traffic edge. `deploys-to`, `authenticates-with` and generic `depends-on` remain visible informational exclusions.

## Safety gates

The adapter blocks on missing/invalid profiles, malformed or dangling relationships, missing/ambiguous API ownership, unconfirmed explicitly marked assumptions, zero/missing traffic, invalid scenario settings, ambiguous branching, and synchronous cycles. It does not inspect canvas position or active view. Topology ordering and IDs are deterministic. The lightweight FNV-1a fingerprints are provenance identifiers only, not cryptographic hashes.

## Test coverage

15 focused tests cover the basic full-stack projection, deterministic ordering, view independence, missing profile, missing and ambiguous endpoint ownership, unconfirmed assumptions, read/write edge grouping, queue-to-worker direction/provenance, ambiguous branching, explicit fan-out, external-service approximation warnings, synchronous cycles, deployment metadata exclusion, and parameter range validation.

## Not yet done

- No simulation engine is called. SimIR output is not itself simulation output.
- The adapter is not exposed in the Workbench UI.
- No visual result charts or scenario editor exist.
- No production build or browser test is claimed.
- OpenAPI/SQL generation remains paused until the first end-to-end simulation is measurable and explainable.
