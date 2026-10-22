# Workbench Audit — Commit 4: Persistence and Reliability

## Scope

This commit addresses persistence snapshot isolation and round-trip reliability for the Workbench document. It does not change the document schema or package version.

## Finding and fix

`buildSketchPersistenceRecord` previously copied `elements` and `files` by reference. The active save path currently calls IndexedDB `put` immediately, but the record builder is also used independently by recent-file/recovery workflows and tests. Returning references to live scene arrays and file maps means the prepared persistence record is not an immutable snapshot: later caller mutations can alter the payload before it is consumed by another asynchronous persistence path.

The builder now deep-clones both `elements` and `files` when creating the record, consistent with the existing cloning of `metadata` and `extensions`.

## Verification

Executed:

```sh
node --test tests/workbench-document-prototype.test.js tests/workbench-persistence-lifecycle.test.js
```

Result: **11 passed, 0 failed**.

Coverage includes:
- `.sketchizi` serialization/deserialization of semantic entities and typed relations;
- active and inactive view scene round trips;
- relation and connector-reference preservation;
- autosave/load and recent snapshot APIs;
- metadata and unrelated extension preservation;
- regression assertion that post-snapshot mutations to live elements/files do not mutate the prepared record.

ZIP integrity checked after packaging. Production build and browser testing were not run because dependencies are not installed in the bundle.

## Suggested commit

`fix(workbench): snapshot scene data before persistence`
