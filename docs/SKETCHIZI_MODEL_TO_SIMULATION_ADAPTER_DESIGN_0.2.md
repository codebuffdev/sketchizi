# Sketchizi Model-to-Simulation Adapter — Design 0.2

## Product intent

Sketchizi is building its own Engineering Workbench. Breakscale is a source of inspiration and a candidate simulator reference, not the product to reproduce. Sketchizi keeps its Excalidraw-based canvas, multi-view semantic model, architecture validation, later artifact generation, and implementation-verification direction. Do not copy Breakscale's UI or model all Sketchizi entities as simulator nodes.

## Architecture

1. **Canonical Workbench model:** describes domain components, contracts, and typed relationships.
2. **Simulation profile:** provides explicit runtime assumptions and experiment inputs separately from domain properties.
3. **Sketchizi SimIR:** a small, engine-neutral runtime projection compiled by a pure adapter.
4. **Engine backend:** a replaceable backend that translates SimIR into one selected simulation engine. Its acceptance contract is seeded reproducibility, explainable mapping, and behavior-focused integration tests.
5. **Experiment record:** records model/profile fingerprints, adapter/backend versions, seed, duration, diagnostics, assumptions and results.

This boundary prevents a simulator's type system from defining Sketchizi's product model. A different engine can be evaluated later without changing the Workbench document format.

## SimIR contract

The prototype output contains:

- `schemaVersion: 1` and `semantics: "sketchizi-runtime-ir"`;
- deterministically ordered nodes: `traffic-source`, `request-service`, `relational-store`, `message-queue`, `message-worker`, or `external-service-approximation`;
- edges: `request`, `enqueue`, `consume`, each with source entity/relation provenance;
- scenario seed and duration;
- `nodeMap`, `edgeMap`, model/profile fingerprints, model revision and sorted diagnostics.

A blocked projection returns `topology: null`; it never silently returns a partial graph when there are blockers.

## Mapping contract

| Workbench semantic | SimIR semantics | Limits |
|---|---|---|
| React application | Traffic source | Traffic rate is an explicit scenario/profile input, not inferred from the existence of a frontend |
| REST service | Request-processing service | Capacity, service-time distribution, queue bounds, errors, timeout and retry assumptions must be supplied |
| API endpoint | Contract metadata | Resolve calls through exactly one `exposes` owner; do not create an extra server hop |
| PostgreSQL | Relational store | Read fraction and write contention are explicit assumptions |
| Queue | Message queue | Buffer and enqueue behavior have explicit parameters |
| Worker | Message worker | Job processing time is not conflated with synchronous API service time; job retry policy is not silently mapped to request retries |
| External API | Approximate external service | Always disclose approximation; never imply live-provider measurement |
| Deployment target | Metadata | Does not process requests merely by being a deployment target |

Relations `reads` and `writes` to the same store from the same caller compile into one runtime hop. `publishes` becomes an enqueue edge; `subscribes` becomes a queue-to-worker consume edge, while provenance retains the original Workbench relation direction. `exposes` resolves API ownership. Deployment/authentication/general dependency relationships stay visible in diagnostics and do not become request edges by default.

## Safety policy

- Missing/invalid profiles and invalid numeric ranges block readiness.
- Explicitly marked but unconfirmed assumptions block readiness.
- API endpoint targets need exactly one owner.
- Multiple outgoing synchronous paths require explicit required-fan-out intent; otherwise block.
- Synchronous request cycles block until their loop/recursion behavior is intentionally modeled.
- Unsupported runtime kinds in a required path block. Unused unsupported kinds are reported as exclusions.
- Canvas position, active view and layout order do not affect simulation output.
- The model and profile are never mutated during compilation.
- Fingerprints are provenance identifiers only; they are not cryptographic hashes.

## First end-to-end target

A small client → REST service → PostgreSQL architecture. Use an explicit seeded workload and profiles. The engine backend should prove (a) identical results for identical input, (b) increased offered traffic affects measured capacity/latency in an explainable way, (c) a supported failure changes observed outcomes, and (d) metrics can be traced to source entities/relations. Until this passes, no metrics should be presented as predictions of a real deployment.

OpenAPI and SQL generation remain paused until that vertical slice passes. It is not necessary to complete every simulation feature first.
