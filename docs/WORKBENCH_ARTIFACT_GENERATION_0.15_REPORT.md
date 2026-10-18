# Sketchizi Engineering Workbench 0.15 — First Artifact Generation Slice

## Goal

Implement the first useful artifact-generation loop from the Workbench's canonical semantic model without modifying the editor's normal drawing, collaboration, or simulation semantics.

## Delivered

- Added deterministic OpenAPI 3.1 JSON generation from `backend.api-endpoint` entities.
- OpenAPI generation requires each endpoint to be exposed by exactly one modeled REST service; duplicate routes, duplicate operation IDs, invalid paths/methods, and malformed/unsupported JSON Schema shapes block export.
- Path placeholders such as `/accounts/{accountId}` become required OpenAPI path parameters.
- Optional request/response JSON Schema text is editable from the endpoint inspector.
- Added PostgreSQL table entities and a `contains-table` relation from a database to its tables.
- Added deterministic SQL DDL preview generation with schema creation, quoted identifiers, type allow-list, column nullability, primary keys, and unique constraints.
- SQL generation blocks unowned tables, duplicate tables/columns, invalid identifiers, invalid JSON and unsupported column types; it does not emit a downloadable result when errors are present.
- The Workbench panel now has OpenAPI and SQL preview actions, diagnostics, code previews and download controls.
- A generated preview records its source model revision in UI state. If semantic model edits occur after generation, the preview is marked stale and download is disabled until regeneration.
- Artifact generation is pure and does not mutate the document. Exported SQL is a preview only; it is never applied to a database.

## How to use

### OpenAPI

1. Add a REST service and an API endpoint.
2. Select the REST service and create an `Exposes API` relationship to the endpoint.
3. Select the endpoint and configure the HTTP method, absolute path, operation ID, and optional request/response JSON Schema objects.
4. In **ARTIFACTS**, choose **Generate OpenAPI**. Resolve reported model errors, regenerate, review the preview, and download `openapi.json`.

### PostgreSQL SQL

1. Add a PostgreSQL component and a PostgreSQL table component.
2. Select the PostgreSQL component and create a `Contains table` relationship to the table.
3. Select the table, set its table name, and edit the columns JSON array. Supported column fields are `name`, `type`, `primaryKey`, `nullable`, and `unique`.
4. In **ARTIFACTS**, choose **Generate SQL**. Resolve errors, review the preview, and download `schema.sql`.

The SQL generator currently supports a conservative allow-list of common PostgreSQL types. It intentionally does not infer foreign keys, indexes, identity generation, migrations, server URLs, authentication schemes, or implementation behavior that is not explicitly modeled.

## Verification

- `npm run test:workbench-artifacts`: 11 passed, 0 failed.
- `npm run test:workbench-format`: 22 passed, 0 failed.
- `npm run test:workbench-validation`: 25 passed, 0 failed.
- `npm run test:simulation`: passed (see command output in the working run).
- `npm run test:simulation-guidance`: passed.
- `npm run test:sync`: 35 passed, 0 failed.
- `npm run test:workbench-ui`: 20 passed, 0 failed.
- Full Node regression suite (`node --import ./tests/register-sync-test-loader.mjs --test tests/*.test.js`): 295 passed, 0 failed.
- TypeScript parser JSX transpile/syntax check of `WorkbenchPanel.jsx`: passed.
- Production build and full browser interaction: not verified here. This working copy has no installed `node_modules`, and the required Excalidraw font assets are not present. Restore dependencies (`npm ci`) in a network-enabled Windows environment and run `npm run build` before release.

## Scope and limitations

- This is a first useful artifact-generation slice, not full code generation.
- Generated OpenAPI and SQL outputs are intended for review; they have not yet been run through an external OpenAPI validator or a live PostgreSQL parser/database in this environment.
- The stable application version remains `1.10.86`; `0.15` is a Workbench prototype iteration label, not an application release version.
- The original stable `1.10.86` baseline archive remains unchanged.
