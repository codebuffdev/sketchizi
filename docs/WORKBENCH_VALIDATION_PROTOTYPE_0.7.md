# Sketchizi Engineering Workbench — Semantic Validation Prototype 0.7

**Base:** Sketchizi 1.10.86 stable baseline  
**Status:** Experimental source prototype; not a production release  
**Scope:** Deterministic semantic model validation and Model Review UI

## Included

- `src/features/workbench/workbenchValidation.js`: pure validation function that returns stable, ordered findings with code, severity, title, message, related entity/relation IDs, and optional suggested action.
- `tests/workbench-validation.test.js`: validation regression suite.
- Model Review section in the Engineering Workbench panel, including error/warning totals and a capped list of findings.
- Selecting a finding attempts to focus its associated component and switch to a view where that component has a canvas placement.
- `npm run test:workbench-validation` for focused validation, registry, model, format and persistence tests.

## Rules in this iteration

| Rule | Severity | Interpretation |
| --- | --- | --- |
| Component or relationship ID is missing or duplicated | Error | Semantic identity is inconsistent |
| Relationship references a missing endpoint | Error | Broken reference in the model |
| Relationship endpoint kinds violate the registry | Error | Typed relationship conflicts with allowed endpoint kinds |
| Same typed relationship appears more than once | Warning | Potential redundant modeling |
| API endpoint has no `Exposes API` relation | Warning | Contract ownership is not modeled |
| API endpoint is exposed by multiple services | Warning | Ownership needs confirmation |
| HTTP method and path duplicate another endpoint | Warning | Potential duplicate operation |
| REST service has no `Deploys to` relation | Warning | Deployment destination is not modeled |
| Worker has no `Subscribes to` relation | Warning | Queue subscription may be missing from the model |
| Queue has no worker subscription | Warning | A modeled consumer is missing |

These rules inspect only the saved semantic model. They do not assert that the runtime is healthy, that an unmodeled dependency does not exist, or that every architecture must use a queue or a specific deployment arrangement. Warnings should be read as incomplete/possibly contradictory documentation rather than universal design requirements.

## Verification

- `npm run test:workbench-validation`: **24 passed, 0 failed**.
- `npm run test:sync`: **35 passed, 0 failed**.
- `npm run test:recovery`: **1 passed, 0 failed**.
- TypeScript transpiler syntax checks passed for `src/App.jsx`, `WorkbenchPanel.jsx`, and `useWorkbenchController.js`.
- Production build: **not verified**. `npm run build` stops in `prebuild` because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent. Restore dependencies with `npm ci` in an environment with package registry access, then rerun the build.
- Real-browser interaction: **not verified** in this environment.

## Compatibility and safety

- Prototype continues using the Workbench extension inside `.sketchizi` documents.
- Ordinary `.excalidraw` shapes/arrows remain visual-only unless explicitly represented as semantic entities or relations.
- This iteration does not add runtime simulation, deployment execution, or code generation.
- Use a copy of any real drawing for manual testing. Keep the original stable ZIP unchanged.

## Next recommended milestone

After dependency restoration, run a production build and browser smoke test. Then add reviewable OpenAPI export from explicitly modeled API endpoints and their properties; validate the generated document independently before adding SQL generation or simulation.
