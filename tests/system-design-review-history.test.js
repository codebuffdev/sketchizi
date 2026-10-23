import test from "node:test";
import assert from "node:assert/strict";
import { createReviewSession, updateReviewSession, finalizeReviewSession } from "../src/features/architecture/systemDesignReviewWorkflow.js";
import { loadSystemDesignReviewHistory, saveSystemDesignReviewHistory, recordSystemDesignReview, compareSystemDesignReviewSnapshots, renderSystemDesignReviewAuditMarkdown } from "../src/features/architecture/systemDesignReviewHistory.js";
function memoryStorage() { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; }
test("records review revisions and audit events in chronological history", () => {
  let history = recordSystemDesignReview(null, createReviewSession({ id: "r1", title: "API review", now: "2026-01-01", diagnostics: [{ code: "A", message: "Initial issue" }] }), "created", "2026-01-01");
  const session = updateReviewSession(createReviewSession({ id: "r1", title: "API review", now: "2026-01-01", diagnostics: [{ code: "A", message: "Initial issue" }] }), { notes: "Reviewed" }, "2026-01-02");
  history = recordSystemDesignReview(history, session, "saved", "2026-01-02");
  assert.equal(history.reviews.length, 2); assert.equal(history.reviews[0].revision, 2); assert.equal(history.events.length, 2); assert.equal(history.events[0].action, "created");
});
test("persists review history and safely handles malformed stored data", () => {
  const storage = memoryStorage(); const session = createReviewSession({ id: "r2" });
  saveSystemDesignReviewHistory(recordSystemDesignReview(null, session, "created", "2026-01-01"), storage);
  assert.equal(loadSystemDesignReviewHistory(storage).reviews[0].session.id, "r2");
  assert.equal(loadSystemDesignReviewHistory({ getItem: () => "invalid" }).reviews.length, 0);
});
test("compares snapshots by component counts and finding changes", () => {
  const before = createReviewSession({ id: "old", graph: { nodes: [{ id: "a" }], edges: [] }, diagnostics: [{ code: "A", message: "Problem", severity: "warning" }] });
  const after = finalizeReviewSession(createReviewSession({ id: "new", graph: { nodes: [{ id: "a" }, { id: "b" }], edges: [{ id: "e" }] }, diagnostics: [{ code: "B", message: "New problem", severity: "error" }] }));
  const diff = compareSystemDesignReviewSnapshots(before, after);
  assert.equal(diff.componentCountDelta, 1); assert.equal(diff.connectionCountDelta, 1); assert.equal(diff.addedFindings.length, 1); assert.equal(diff.removedFindings.length, 1); assert.equal(diff.statusChanged, true);
});
test("renders audit trail with a transparency limitation", () => {
  const history = recordSystemDesignReview(null, createReviewSession({ id: "r3", title: "Security review" }), "created", "2026-01-01");
  const markdown = renderSystemDesignReviewAuditMarkdown(history);
  assert.match(markdown, /Security review/); assert.match(markdown, /not a tamper-proof compliance log/);
});
