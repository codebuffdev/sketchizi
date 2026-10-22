# Breakscale-Inspired Workbench Redesign — Phase 15

## Relationship lifecycle consistency checks

- Added regression coverage spanning typed relationship creation, editing, deletion, canvas connector updates, and persistence calls.
- Verifies that each create/update/delete operation updates the canvas and saves the semantic model together with the resulting scene snapshot.
- Verifies edits preserve the canonical relationship ID while changing type and endpoints in place.
- Verifies deletion targets only the connector tagged for that semantic relationship.
- Verifies relationship metadata carries relation ID, view ID, role, and kind, and that document persistence retains extension data for reload.
- No application behavior or package version was changed in this phase; this phase adds regression guards around the existing lifecycle.
- Preserved package version `1.10.86`.

## Verification performed

Command:

```bash
node --test tests/workbench-relationship-lifecycle.test.js tests/workbench-relationship-deletion.test.js tests/workbench-relationship-editing.test.js tests/workbench-relationship-preview.test.js tests/typed-relation-scene.test.js tests/workbench-persistence-lifecycle.test.js tests/sketchizi-format.test.js
```

Result: **28 passed, 0 failed**.

These include source-level contract tests and existing serialization/persistence tests. They do not constitute a full browser test or prove an actual IndexedDB reload of a live relationship lifecycle. Production build and browser verification remain outstanding.
