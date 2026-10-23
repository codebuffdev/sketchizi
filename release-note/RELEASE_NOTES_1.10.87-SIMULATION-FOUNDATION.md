# Sketchizi 1.10.87 — Simulation Foundation

## Added

- Initial Simulation mode panel integrated into the existing canvas workspace.
- Shared normalized graph model derived from Excalidraw shapes and bound arrows/lines.
- Deterministic discrete-event engine with virtual time, seeded failure injection, retry limits, conditional branches, and execution safeguards.
- Per-element simulation metadata under `customData.simulation`, preserving existing custom metadata.
- Node configuration for behavior, duration, failure probability, retry count, retry delay, and decision probability.
- Connector configuration for routing condition and virtual latency.
- Runtime event log and metrics for completed/failed executions, retries, mean/p95 latency, throughput, and queue depth.
- Simulation unit tests (`npm run test:simulation`).

## Compatibility and scope

- Runtime tokens and event state are not persisted in the diagram.
- Existing scene persistence and collaboration flows are reused.
- No simulation backend endpoint is introduced.
- This is the initial simulation foundation. The next iteration should add visual connector-traversal animation, richer parallel-join semantics, and full browser/build regression validation.
