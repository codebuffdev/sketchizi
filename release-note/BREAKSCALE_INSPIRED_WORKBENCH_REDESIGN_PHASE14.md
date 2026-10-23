# Breakscale-Inspired Workbench Redesign — Phase 14

## Safe relationship deletion

- Added a Delete relationship action to the typed relationship inspector.
- Requires explicit confirmation before deletion.
- Removes the canonical semantic relationship and increments the model revision.
- Tombstones only the canvas connector tagged with the matching semantic relation ID and relation role. Unrelated user-drawn arrows are preserved.
- Persists the updated model and scene through the existing document save path.
- Reports missing relationships, unavailable canvas state, and other failures without claiming success.
- Added regression tests for canonical deletion, connector targeting, app wiring, and confirmation UI.
- Preserved package version `1.10.86`.

## Verification

Run the new deletion tests and the existing focused Workbench regression suite. Production build and browser verification must be performed in an environment with dependencies installed.
