# Engineering Workbench End-to-End Simulation Runner 0.11

## Purpose

This increment makes one code path responsible for the first Workbench simulation vertical slice:

`Workbench semantic model + confirmed profile -> Sketchizi SimIR projection -> Sketchizi simulation engine -> baseline/surge/outage -> model-linked explanations`

The module is `src/features/simulation/runWorkbenchExperiments.js`. It is engine-neutral at the model boundary and invokes Sketchizi's own current engine. It does not import Breakscale code, types, UI, or runtime artifacts.

## UI integration

`SimulationExperimentPanel.jsx` now delegates experiment preparation and execution to this shared runner. It consumes the explanations attached to each run instead of recomputing them separately in the component. This means tests and UI exercise the same orchestration path.

## API

`runWorkbenchExperiments({ workbench, simulationProfile, trafficMultiplier = 5, outageTargetEntityId, limits })`

Returns `status`, `projection`, `diagnostics`, `provenance`, `profileUsed`, `runs`, `outageTargetId`, and `scenarioKeys`.

- `blocked`: projection invalid, assumptions unconfirmed, or invalid traffic multiplier; no runs are created.
- `completed`: baseline, traffic surge, and outage all complete.
- `partial`: at least one run completes but a requested/default scenario could not be scheduled or completed.

Every run retains the original engine result, scenario overrides, explanatory findings, and engine provenance. Explanation entity IDs refer back to Workbench semantic entity IDs.

## Safety and fidelity constraints

- Synthetic assumptions must be explicitly confirmed before the projection can run.
- A profile multiplier of 1 is rejected for the surge scenario; otherwise a supposedly changed scenario would silently duplicate baseline behavior.
- Outage targets must map to a supported runtime node.
- Unsupported topology and model semantics stay blocked by the projection/engine rather than being guessed.
- Simulation results are synthetic model results, not live measurements or guaranteed forecasts.
- Queue/worker semantics, timeout/retry behavior and ambiguous routing remain unsupported until modeled explicitly.

## Runnable example

From the project root, run:

```powershell
npm run example:workbench-simulation
```

The script creates an illustrative four-entity Workbench model (React client, REST service, endpoint contract, PostgreSQL), marks the synthetic profile as explicitly acknowledged for this example, executes all three scenarios and prints compact metrics, run fingerprints, and component-linked explanations as JSON.

To run the focused suite:

```powershell
npm run test:simulation
```

## Verification

- Full Node test suite: 242 passed, 0 failed.
- Simulation suite, including six new orchestration tests: 38 passed, 0 failed.
- Runnable end-to-end example: completed baseline, surge and database-outage runs.
- Production build: **not verified**. `npm run build` stops in `prebuild` because the worktree does not have the Excalidraw package font assets. The failure is documented; no fake font assets or build bypass were introduced.
- Real-browser UI workflow: still pending.

## Not included

This increment does not add queue scheduling, timeout/retry semantics, live telemetry ingestion, OpenAPI generation, SQL generation, or a Breakscale engine integration. OpenAPI/SQL generation remains intentionally paused until the end-to-end simulation workflow is verified in a real browser and the engine's supported behavior is sufficiently characterized.
