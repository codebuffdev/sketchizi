# Sketchizi Simulation Engine

## Design

Simulation is a client-side feature. It reads existing Excalidraw elements, normalizes bound shapes and connectors into a graph, validates that graph, and executes it with a deterministic discrete-event engine. Runtime state is deliberately separate from the persisted scene.

## Metadata

Simulation metadata is optional and stored under each relevant element's `customData.simulation` property. Existing `customData` fields are retained. The first schema uses `schemaVersion: 1`, `domain`, `nodeType` and `config` for nodes; connectors use `edgeType`, `condition` and `latencyMs`.

## Controls

Open Simulation from the upper-right of the canvas. Choose Process flow or Software architecture, select a shape to configure its behavior, and select a bound connector to configure route conditions and latency. Run, Pause, Step, and Reset control the in-memory execution. The event inspector displays virtual timestamps and current metrics.

## Engine safeguards

The engine has limits for scheduled/processed events, active tokens, and virtual duration. Failures use seeded randomness for reproducibility. Retry attempts are bounded by the configured maximum. The event log is bounded to avoid unbounded memory growth.

## Current limitations

- Connector normalization requires Excalidraw start/end element bindings; unbound connectors are diagnosed and ignored.
- Process-flow and architecture node types currently share task-like execution semantics except for Start, Decision, and End. Domain-specific service, database, queue capacity, and parallel-join behavior remain future work.
- The initial token overlay marks active/waiting tokens at their current node; interpolation along connector paths is a follow-up enhancement.
- Full production build and browser-level verification must be run in an environment where the project dependencies can be installed.
