# Workbench 1.42 — Reviewable Typed Relationship Connections

## Scope

Build on the Requirement-to-Architecture Studio by turning its proposed typed relationships into actionable connections when both endpoint components already exist in the active view.

## Changes

- Requirement proposals now include source and target component kinds for each suggested relationship.
- The Studio renders suggested typed relationships with rationale.
- A relationship can be created through the existing `onCreateRelationBetween` model callback when matching endpoint components exist in the active view.
- Already-connected relationships are identified, and unavailable endpoints remain disabled with explanatory guidance.
- Relationship creation continues to use the Workbench's existing endpoint validation, semantic model, and persistence path.
- No document schema or package version change.

## Verification

Focused tests run:

`node --test tests/workbench-requirement-architecture-proposal.test.js tests/workbench-panel-layout.test.js tests/workbench-registry.test.js tests/workbench-document-prototype.test.js tests/workbench-persistence-lifecycle.test.js`

Result: 43 passed, 0 failed.

ZIP integrity checked after packaging. Production build and browser visual verification were not run.
