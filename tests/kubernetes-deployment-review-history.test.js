import test from "node:test";
import assert from "node:assert/strict";
import {
  KUBERNETES_REVIEW_HISTORY_LIMIT,
  KUBERNETES_REVIEW_HISTORY_KEY,
  loadKubernetesReviewHistory,
  saveKubernetesReviewSnapshot,
  deleteKubernetesReviewSnapshot,
  summarizeKubernetesReviewHistory,
} from "../src/features/architecture/kubernetesDeploymentReviewHistory.js";

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
  };
}
function snapshot(id, total = 1) {
  return {
    reportType: "sketchizi-kubernetes-deployment-review",
    generatedAt: `2026-10-17T12:00:${String(id).padStart(2, "0")}Z`,
    summary: { total },
    findings: [],
    title: "Review",
  };
}

test("saved review snapshots survive reload by reading the same storage adapter", () => {
  const storage = memoryStorage();
  const result = saveKubernetesReviewSnapshot(storage, snapshot(1), { savedAt: "2026-10-17T12:01:00Z" });
  assert.equal(result.ok, true);
  const reloadedHistory = loadKubernetesReviewHistory(storage);
  assert.equal(reloadedHistory.length, 1);
  assert.equal(reloadedHistory[0].snapshot.generatedAt, snapshot(1).generatedAt);
});

test("history is newest-first and bounded to ten snapshots", () => {
  const storage = memoryStorage();
  for (let i = 0; i < KUBERNETES_REVIEW_HISTORY_LIMIT + 3; i++) {
    saveKubernetesReviewSnapshot(storage, snapshot(i, i), { savedAt: `2026-10-17T12:${String(i).padStart(2, "0")}:00Z` });
  }
  const history = loadKubernetesReviewHistory(storage);
  assert.equal(history.length, KUBERNETES_REVIEW_HISTORY_LIMIT);
  assert.equal(history[0].snapshot.summary.total, KUBERNETES_REVIEW_HISTORY_LIMIT + 2);
});

test("invalid data and unavailable storage fail safely", () => {
  const malformed = memoryStorage({ [KUBERNETES_REVIEW_HISTORY_KEY]: "{bad json" });
  assert.deepEqual(loadKubernetesReviewHistory(malformed), []);
  assert.deepEqual(loadKubernetesReviewHistory(null), []);
  assert.equal(saveKubernetesReviewSnapshot(null, snapshot(1)).ok, false);
  const badShape = saveKubernetesReviewSnapshot(memoryStorage(), { findings: [] });
  assert.equal(badShape.ok, false);
});

test("history deletes a selected snapshot without removing other snapshots", () => {
  const storage = memoryStorage();
  saveKubernetesReviewSnapshot(storage, snapshot(1), { savedAt: "2026-10-17T12:01:00Z" });
  saveKubernetesReviewSnapshot(storage, snapshot(2), { savedAt: "2026-10-17T12:02:00Z" });
  const history = loadKubernetesReviewHistory(storage);
  const result = deleteKubernetesReviewSnapshot(storage, history[0].id);
  assert.equal(result.ok, true);
  assert.equal(result.history.length, 1);
  assert.equal(result.history[0].snapshot.generatedAt, snapshot(1).generatedAt);
});

test("storage quota errors are reported without throwing", () => {
  const storage = {
    getItem() { return null; },
    setItem() { throw new Error("quota"); },
  };
  const result = saveKubernetesReviewSnapshot(storage, snapshot(1));
  assert.equal(result.ok, false);
  assert.deepEqual(result.history, []);
});


test("history summaries expose dates, counts, and review status for the history view", () => {
  const summary = summarizeKubernetesReviewHistory([{
    id: "entry-1",
    savedAt: "2026-10-17T12:00:00Z",
    snapshot: {
      title: "Review",
      summary: { total: 4, errors: 1, warnings: 2, info: 1, reviewed: 3, unreviewed: 1, resolved: 2 },
    },
  }]);
  assert.deepEqual(summary[0], {
    id: "entry-1",
    savedAt: "2026-10-17T12:00:00Z",
    total: 4, errors: 1, warnings: 2, info: 1,
    reviewed: 3, unreviewed: 1, resolved: 2, title: "Review",
  });
});
