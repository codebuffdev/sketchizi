# Cloud Workspace chapter sequences

A project's diagrams are shown as ordered **chapters** (`CH 01`, `CH 02`, ...) in a **Sequence Flow** (default) or **Grid** view.

## Rules
- Position is `orderIndex` (0-based). Opening, editing or saving a diagram changes only `lastOpenedAt` / `updatedAt`, never `orderIndex`.
- The most recently opened chapter is tagged **Last Opened** in place; it is not moved to the front.
- Deleting a chapter compacts `orderIndex` and chapter numbers. Reordering (drag, or the `←` / `→` buttons) renumbers the pills.
- Projects with no stored order are initialised with natural numeric title order (`day-02` < `day-10`) and then locked, so later renames do not reorder them.
- `+ Add Next Chapter` and the trailing `+ Chapter NN` card pre-fill the next name from the last chapter's prefix (`day-05-systemdesign-implementation` -> `day-06-systemdesign-`).

## Where the data lives
`src/features/workspace/chapterSequence.js` resolves the order from, in priority:
1. `orderIndex` / `chapterStatus` on the diagram record, **only when every diagram in the project has a unique integer `orderIndex`**;
2. a per-project layout in `localStorage` (`sketchizi.workspace.chapterLayout.v1`);
3. natural title order.

Chapter metadata is deliberately **not** stored inside the scene document: autosave `PUT`s rewrite the document and would clobber or stale it.

## Backend contract (needed for cross-device sync)
The dashboard sends metadata-only `PATCH /api/workspace/diagrams/{id}` with `{ "orderIndex": <int>, "chapterStatus": "up-next" | "active" | "done" }` and ignores failures. For the order to sync across browsers, the Spring service must persist both fields and return them on `GET /projects/{id}/diagrams`. Until then the order and statuses are per-browser (fallback 2 above).
