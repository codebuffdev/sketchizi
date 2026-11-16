import test from "node:test";
import assert from "node:assert/strict";
import {
  KUBERNETES_REMEDIATION_CHECKLIST_KEY,
  buildKubernetesRemediationChecklistExport,
  loadKubernetesRemediationChecklist,
  renderKubernetesRemediationChecklistMarkdown,
  saveKubernetesRemediationChecklist,
  setKubernetesRemediationTaskStatus,
  summarizeKubernetesRemediationChecklist,
  syncKubernetesRemediationChecklist,
} from "../src/features/architecture/kubernetesRemediationChecklist.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
  };
}

const findings = [
  { id: "err-1", code: "K8S_DEPLOYMENT", severity: "error", resourceId: "deployment/api", message: "Replicas are invalid", remediation: "Set replicas to a positive integer", secret: "not exported" },
  { id: "warn-1", code: "K8S_SERVICE", severity: "warning", resourceId: "service/api", message: "Selector missing", remediation: "Add a selector" },
];

test("checklist sync creates pending tasks from findings and persists allowlisted fields", () => {
  const storage = memoryStorage();
  const result = syncKubernetesRemediationChecklist(storage, findings);
  assert.equal(result.ok, true);
  assert.equal(result.tasks.length, 2);
  assert.equal(result.tasks[0].status, "pending");
  assert.equal(result.tasks[0].secret, undefined);
  const loaded = loadKubernetesRemediationChecklist(storage);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.tasks.length, 2);
  assert.equal(storage.getItem(KUBERNETES_REMEDIATION_CHECKLIST_KEY) !== null, true);
});

test("task status can be marked complete and then pending again", () => {
  const storage = memoryStorage();
  const synced = syncKubernetesRemediationChecklist(storage, findings);
  const completed = setKubernetesRemediationTaskStatus(storage, synced.tasks, "err-1", "completed");
  assert.equal(completed.ok, true);
  assert.equal(completed.tasks.find((task) => task.id === "err-1").status, "completed");
  assert.ok(completed.tasks.find((task) => task.id === "err-1").updatedAt);
  const pending = setKubernetesRemediationTaskStatus(storage, completed.tasks, "err-1", "pending");
  assert.equal(pending.tasks.find((task) => task.id === "err-1").status, "pending");
});

test("refresh preserves task statuses and updates changed finding details", () => {
  const storage = memoryStorage();
  const initial = syncKubernetesRemediationChecklist(storage, findings);
  const completed = setKubernetesRemediationTaskStatus(storage, initial.tasks, "err-1", "completed");
  const refreshed = syncKubernetesRemediationChecklist(storage, [
    { ...findings[0], message: "Replicas must be positive" },
  ]);
  assert.equal(refreshed.tasks.find((task) => task.id === "err-1").status, "completed");
  assert.equal(refreshed.tasks.find((task) => task.id === "err-1").message, "Replicas must be positive");
});

test("summary counts pending errors and export supports Markdown and JSON", () => {
  const storage = memoryStorage();
  const result = syncKubernetesRemediationChecklist(storage, findings);
  const completed = setKubernetesRemediationTaskStatus(storage, result.tasks, "err-1", "completed");
  assert.deepEqual(summarizeKubernetesRemediationChecklist(completed.tasks), {
    total: 2, pending: 1, completed: 1, errors: 0,
    active: 2, resolved: 0, pendingResolved: 0, progressPercent: 50,
  });
  const report = buildKubernetesRemediationChecklistExport(completed.tasks, "2026-10-17T00:00:00Z");
  assert.equal(report.reportType, "sketchizi-kubernetes-remediation-checklist");
  assert.equal(report.tasks.length, 2);
  assert.match(renderKubernetesRemediationChecklistMarkdown(report), /\[x\] \*\*K8S_DEPLOYMENT\*\*/);
  assert.match(report.scopeNote, /does not apply changes/);
  assert.equal(JSON.stringify(report).includes("not exported"), false);
});

test("unavailable storage and invalid data fail safely", () => {
  assert.deepEqual(loadKubernetesRemediationChecklist(null), { ok: false, tasks: [] });
  const storage = memoryStorage();
  storage.setItem(KUBERNETES_REMEDIATION_CHECKLIST_KEY, "{bad json");
  assert.deepEqual(loadKubernetesRemediationChecklist(storage), { ok: false, tasks: [] });
  assert.equal(saveKubernetesRemediationChecklist(null, []).ok, false);
});


test("revalidation retains missing tasks and marks their findings resolved without auto-completing", () => {
  const storage = memoryStorage();
  const initial = syncKubernetesRemediationChecklist(storage, findings);
  const completed = setKubernetesRemediationTaskStatus(storage, initial.tasks, "warn-1", "completed");
  const refreshed = syncKubernetesRemediationChecklist(storage, [findings[0]]);
  assert.equal(refreshed.tasks.length, 2);
  const resolved = refreshed.tasks.find((task) => task.id === "warn-1");
  assert.equal(resolved.findingPresent, false);
  assert.equal(resolved.status, "completed");
  assert.equal(refreshed.tasks.find((task) => task.id === "err-1").findingPresent, true);
  assert.equal(loadKubernetesRemediationChecklist(storage).tasks.length, 2);
});

test("a resolved finding that reappears becomes active and keeps its checklist status", () => {
  const storage = memoryStorage();
  const initial = syncKubernetesRemediationChecklist(storage, findings);
  setKubernetesRemediationTaskStatus(storage, initial.tasks, "warn-1", "completed");
  const resolved = syncKubernetesRemediationChecklist(storage, [findings[0]]);
  assert.equal(resolved.tasks.find((task) => task.id === "warn-1").findingPresent, false);
  const reappeared = syncKubernetesRemediationChecklist(storage, findings);
  const task = reappeared.tasks.find((item) => item.id === "warn-1");
  assert.equal(task.findingPresent, true);
  assert.equal(task.status, "completed");
});

test("summary and exports distinguish diagnostic resolution from checklist completion", () => {
  const storage = memoryStorage();
  const initial = syncKubernetesRemediationChecklist(storage, findings);
  const refreshed = syncKubernetesRemediationChecklist(storage, [findings[0]]);
  const summary = summarizeKubernetesRemediationChecklist(refreshed.tasks);
  assert.equal(summary.total, 2);
  assert.equal(summary.active, 1);
  assert.equal(summary.resolved, 1);
  assert.equal(summary.pendingResolved, 1);
  assert.equal(summary.progressPercent, 0);
  const report = buildKubernetesRemediationChecklistExport(refreshed.tasks, "2026-10-17T00:00:00Z");
  assert.equal(report.summary.pendingResolved, 1);
  assert.match(renderKubernetesRemediationChecklistMarkdown(report), /Pending tasks for resolved findings: 1/);
  assert.match(renderKubernetesRemediationChecklistMarkdown(report), /Resolved in current diagram validation/);
});
