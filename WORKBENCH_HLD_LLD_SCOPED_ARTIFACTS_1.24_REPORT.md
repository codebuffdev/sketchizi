# Workbench 1.24 — Service-scoped artifact generation

## Delivered
- Added `scopeWorkbenchToService` to produce a closed semantic-model subset for a selected HLD component.
- Scope includes the selected HLD component, LLD components explicitly assigned through `implementationParentId`, API endpoints exposed by that component, and database entities that contain explicitly scoped tables.
- Relations are retained only when both endpoints are in the scoped entity set. Unknown scope IDs fail closed to an empty model.
- Added an Artifact scope selector to the artifact panel. Entire model remains the default; selecting an HLD component scopes both OpenAPI and SQL generation.
- Scoped OpenAPI artifacts carry `x-sketchizi-artifact-scope` metadata and service-specific filenames. Scoped SQL previews include an HLD scope comment and service-specific filenames.
- Existing model revision/stale-preview protection remains in place.

## Verification
Targeted Node tests passed: 45 passed, 0 failed across HLD/LLD ownership, artifact generation, model, panel layout, POC UI, registry, and persistence lifecycle.
ZIP integrity checked separately. Production build and browser testing were not run in this environment.

## Limitations
This scopes artifacts based on explicit ownership and the existing `exposes` / `contains-table` relations. It does not infer ownership for unassigned components or claim that generated outputs are production-ready.
