# Breakscale-Inspired Workbench Redesign — Phase 13

## Relationship editing

- Added staged editing for a selected typed relationship: relationship kind, source component, and target component.
- Added `updateRelation` to the Workbench controller and wired it into the inspector.
- The update path validates the candidate against the canonical semantic model, excluding the current relation from duplicate detection.
- Endpoint changes require both endpoint components to exist in the relationship's design view.
- Successful edits update the semantic relationship, connector visual style, connector metadata, and endpoint bindings, then persist through the existing document save path.
- Validation failures leave the model and canvas unchanged and report the reason in the inspector/toast.
- Preserved package version `1.10.86`.

## Verification

Ran 12 focused regression files with Node's built-in test runner: **91 passed, 0 failed**. Includes persistence, serialization, model validation, artifact generation, connector behavior, relationship inspection, and new relationship-editing wiring tests.

Production build and live browser verification were not run in this environment.
