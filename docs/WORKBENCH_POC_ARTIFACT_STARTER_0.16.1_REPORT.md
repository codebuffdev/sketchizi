# Engineering Workbench — POC Artifact Starter Upgrade 0.16.1

## Summary

The user's screenshots showed a POC that could run synthetic experiments but could not immediately generate OpenAPI or SQL: the starter model contained the three runtime components only, so the ARTIFACTS section asked the user to manually add an API endpoint and a PostgreSQL table.

This patch makes artifact generation part of the starter POC workflow while retaining the same canonical Workbench model and three-node runtime simulation.

## Changes

- The React + REST + PostgreSQL starter now creates five semantic entities:
  - React application — traffic source.
  - REST service — request processor.
  - PostgreSQL — relational data store.
  - `GET /api/items` API endpoint with a valid OpenAPI response schema.
  - `items` table with `id`, `name`, and `created_at` columns.
- The starter includes four typed relationships: `Calls`, `Reads from`, `Exposes API`, and `Contains table`.
- The canvas places and tags all four connectors with their canonical relationship IDs.
- Simulation treats the API endpoint and table as contract/schema metadata, not extra runtime nodes. The request-path projection remains three runtime nodes and two runtime edges.
- Existing POC documents created from the older three-component template gain an **Add starter API + table** action. It adds missing semantic pieces and connectors without replacing the existing runtime entities, profiles, or unrelated drawing.
- The upgrade is idempotent and refuses ambiguous cases where there are multiple service/database/endpoint/table candidates rather than guessing.
- The POC preview and status copy explain the endpoint/table that support artifact generation.

## Verification

- Full Node regression suite: **312 passed, 0 failed**.
- Focused POC, artifact-generation, simulation projection, and runner suites: **51 passed, 0 failed**.
- JSX syntax parsing: passed for `src/App.jsx` and `src/features/workbench/WorkbenchPanel.jsx` using the installed global TypeScript transpiler.
- JavaScript syntax checks: passed for the changed controller, POC template, and simulation projection modules.
- The regression test creates an older three-runtime-component POC, upgrades it, checks that the original runtime entity IDs and simulation profiles are preserved, verifies both starter artifact generators succeed, and confirms the run remains a three-node/two-edge runtime projection.
- Production build: **not verified**. `npm run build` stops during `prebuild` because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent; dependencies are not installed in this source worktree.
- Real-browser verification: **not run**. The new upgrade control and generated previews still need to be exercised in the user's local browser.

## How to verify locally on Windows

From the extracted `sketchizi-main` folder:

```powershell
npm ci
npm run build
npm run test:workbench-poc
npm run test:workbench-artifacts
npm run test:simulation
npm run dev -- --force
```

For an already-existing POC created with the three-component template, open the Engineering Workbench in the System view and use **POC WORKFLOW → Add starter API + table**. Then select **ARTIFACTS → Generate OpenAPI** and **ARTIFACTS → Generate SQL**. Both should produce valid preview text and enable downloads after validation. The original three runtime components remain the simulation path.

For a new POC, use **Create POC** from an empty Workbench; the starter endpoint and table are created automatically.

## Remaining limitations

- The starter OpenAPI contract models a `GET /api/items` response; it is a sample contract, not a running REST implementation.
- SQL generation still supports a single PostgreSQL target and the documented supported column types. It does not infer foreign keys, indexes, migrations, or deployment settings.
- Browser interaction and production build must pass locally before calling this release fully verified.

## Suggested Git commit

`feat(workbench): include starter API and SQL schema in POC template`
