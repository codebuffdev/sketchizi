# Workbench Audit — Commit 3: API and Database Consistency

## Scope

This commit hardens the OpenAPI generation boundary in `src/features/workbench/workbenchArtifacts.js`.

## Defects addressed

1. OpenAPI route collision detection previously compared literal path strings. Paths such as `/accounts/{accountId}` and `/accounts/{id}` have the same templated route shape for the same HTTP method and must not be emitted as distinct operations.
2. JSON Schema `required` arrays were checked for string entries, but not for duplicate names or names absent from the schema's declared `properties`.

## Changes

- Normalize path-template placeholders for route collision detection while retaining original paths in generated output.
- Report `openapi.duplicate-route` with both source endpoint IDs when equivalent templated routes collide.
- Reject duplicated required-property names with `openapi.duplicate-schema-required`.
- Reject required-property names that are not declared under `properties` with `openapi.schema-required-property-missing`.
- Invalid generation remains fail-closed: `ok` is false and generated `text` is empty.
- Add regression tests for both cases.

## Verification

Command:

```sh
node --test tests/workbench-artifacts.test.js tests/workbench-artifact-external-validation.test.mjs tests/workbench-postgres-artifact-integration.test.mjs
```

Result: **31 passed, 0 failed**.

ZIP integrity is checked separately after packaging. Production build and browser visual verification were not run. These tests do not prove all API schemas and database entities are fully connected to one shared domain model; that remains a broader audit item.

## Suggested commit

```text
fix(workbench): reject inconsistent OpenAPI routes and schema requirements
```
