# Phase 16 — Relationship lifecycle round-trip integration

## Scope

Adds an executable integration-style regression test that exercises the Workbench relationship model helpers, typed connector metadata, Sketchizi serialization/deserialization, and persistence-record snapshotting together.

The scenario creates a typed relationship, edits its kind and target while retaining its canonical ID, serializes and reopens the document, then deletes the relation and verifies that only its semantic connector is removed while an unrelated user-drawn arrow remains.

A second scenario confirms duplicate, incompatible, and self-relationships are rejected by the model validator.

## Verification performed

Command:

```bash
node --test tests/workbench-relationship-lifecycle.test.js tests/workbench-relationship-editing.test.js tests/workbench-relationship-deletion.test.js tests/workbench-relationship-preview.test.js tests/typed-relation-scene.test.js tests/workbench-model.test.js tests/workbench-persistence-lifecycle.test.js tests/sketchizi-format.test.js tests/workbench-relationship-roundtrip-integration.test.js
```

Result: **38 passed, 0 failed**.

This is an integration test across actual pure model, scene, persistence-record, and file-format helpers. It does not invoke React's live controller callbacks or a browser, and is not a substitute for end-to-end browser verification. Production build and browser checks were not run in this environment.

Package version remains `1.10.86`.
