# Sketchizi Engineering Workbench 0.16 — Full-Stack POC Template and Guided Debugging

## Objective

Implement the React → REST service → PostgreSQL template workflow from the POC specification using the existing canonical Workbench model, typed-relation registry, persistence envelope and simulation runner. No separate POC data model is introduced.

## Implemented

- Added a `Web application with database` template entry and architecture preview to the Workbench when the semantic model is empty.
- Added a `Create POC` action that creates the React application, REST service and PostgreSQL entities, their default properties, a `Calls` relation, a `Reads from` relation, and proposed simulation profiles.
- Added scene descriptors for the two arrows and three component placements. Each connector carries the canonical semantic relationship ID; node placements carry the canonical entity ID and System view ID.
- The controller prepares the semantic model and scene descriptors before committing one `updateScene` call. It preserves existing visual-only drawing and refuses to overwrite an existing semantic model. Creation is limited to the System view.
- POC profiles use the engine's existing defaults: 50 RPS, a 15-second observation window, seed 211, REST concurrency 8/service time 25 ms, and PostgreSQL concurrency 6/service time 30 ms. These values remain proposed synthetic assumptions and require user acknowledgement before execution.
- Added a compact POC status card with Configure, Validate, and Experiment & debug navigation.
- Added a **Test an improvement** workflow after a completed current simulation suite. It uses modeled component-pressure evidence to choose an in-scope runtime component, changes only a cloned profile's concurrency value, runs a comparison suite using the same model/seed/duration, and compares its baseline with the original baseline.
- The improvement trial does not mutate the canonical Workbench model or base profile. It is recorded in the existing bounded experiment history with the changed entity/field/value and base profile snapshot. History freshness checks compare the controlled experiment against that base profile, while still detecting model or base-profile changes.
- Added tests for template creation, typed relation IDs, serialization round-trip, non-overwrite behavior, complete baseline/surge/outage simulation, one-variable profile isolation, actual runner comparison, improvement-history metadata and UI wiring.

## Verification

- Full Node regression suite: **309 passed, 0 failed**.
- Focused improvement-model and POC UI checks: **15 passed, 0 failed**; history round-trip and freshness regressions also pass in the full suite.
- JavaScript syntax checks: passed for the new template module, Workbench controller, simulation model/history modules and modified tests.
- JSX syntax parsing: passed for `src/App.jsx`, `src/features/workbench/WorkbenchPanel.jsx`, and `src/features/simulation/experiments/SimulationExperimentPanel.jsx` using the installed TypeScript parser.
- ZIP integrity: checked after packaging.
- Production build: **not verified**. `npm run build` stops in `prebuild` because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent; dependency restoration has not been completed in this environment.
- Full real-browser React/Excalidraw interaction: **not verified**. The tests include UI wiring assertions and pure model/simulation tests; they do not substitute for running the feature interactively in the actual browser.

## Local verification

From the extracted `sketchizi-main` directory on Windows:

```powershell
npm ci
npm run build
npm run test:workbench-poc
npm run test:simulation
npm run test:workbench-artifacts
npm run dev
```

Open Engineering Workbench on a document with an empty semantic model and select **Create POC**. Confirm the canvas shows React → REST → PostgreSQL, the Inspector reports the two typed relationships, and Experiments includes all three runtime profiles. Review and confirm assumptions before running baseline, 5× traffic and PostgreSQL-unavailable scenarios. Once the suite completes, use **Test a capacity improvement** to run a controlled one-variable trial and compare its baseline metrics. Verify the trial appears in saved experiment history, then save and reopen the `.sketchizi` document to confirm the actual browser lifecycle.

## Known boundaries

- The template is intentionally available only when the semantic model is empty and the active view is System. It does not replace existing semantic models. Existing freeform drawing is preserved.
- The template includes only the three specified runtime entities; an API endpoint and database table must be added separately for OpenAPI or SQL generation.
- The template and improvement workflow use illustrative simulation profiles, not live system measurements.
- The one-variable improvement currently changes concurrency only. It uses the highest-pressure eligible component identified by the modeled results and increases capacity by approximately 25%, with at least one additional concurrency unit for integer-valued settings. It does not claim the change will improve every metric.
- A missing deployment target remains a model-review warning; no deployment is created or implied.
- This iteration is a Workbench prototype label, not an application version bump. The stable `1.10.86` package version is unchanged.

## Suggested Git commit

`feat(workbench): add full-stack POC template and guided capacity experiment`
