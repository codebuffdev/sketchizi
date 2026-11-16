export const KUBERNETES_REMEDIATION_CHECKLIST_KEY = "sketchizi:kubernetes-remediation-checklist:v1";

function safeStorage(storage) {
  try { return storage || null; } catch { return null; }
}

function normalizeTask(task) {
  if (!task || typeof task !== "object" || typeof task.id !== "string" || !task.id) return null;
  return {
    id: task.id,
    findingId: typeof task.findingId === "string" ? task.findingId : "",
    code: typeof task.code === "string" ? task.code : "",
    severity: typeof task.severity === "string" ? task.severity : "unknown",
    resourceId: typeof task.resourceId === "string" ? task.resourceId : "",
    message: typeof task.message === "string" ? task.message : "",
    remediation: typeof task.remediation === "string" ? task.remediation : "",
    status: task.status === "completed" ? "completed" : "pending",
    updatedAt: typeof task.updatedAt === "string" ? task.updatedAt : null,
    findingPresent: task.findingPresent !== false,
  };
}

export function loadKubernetesRemediationChecklist(storage, key = KUBERNETES_REMEDIATION_CHECKLIST_KEY) {
  try {
    const target = safeStorage(storage);
    if (!target) return { ok: false, tasks: [] };
    const raw = target.getItem(key);
    if (!raw) return { ok: true, tasks: [] };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { ok: false, tasks: [] };
    const tasks = parsed.map(normalizeTask).filter(Boolean);
    return { ok: true, tasks };
  } catch {
    return { ok: false, tasks: [] };
  }
}

export function syncKubernetesRemediationChecklist(storage, findings, options = {}) {
  const key = options.key || KUBERNETES_REMEDIATION_CHECKLIST_KEY;
  const loaded = loadKubernetesRemediationChecklist(storage, key);
  const previous = new Map(loaded.tasks.map((task) => [task.id, task]));
  const next = [];
  for (const finding of Array.isArray(findings) ? findings : []) {
    if (!finding || typeof finding !== "object") continue;
    const id = String(finding.id || finding.diagnosticId || [finding.code || "", finding.resourceId || "", finding.relationshipId || ""].join("|"));
    const old = previous.get(id);
    next.push({
      id,
      findingId: id,
      code: typeof finding.code === "string" ? finding.code : "",
      severity: typeof finding.severity === "string" ? finding.severity : "unknown",
      resourceId: typeof finding.resourceId === "string" ? finding.resourceId : (typeof finding.sourceResourceId === "string" ? finding.sourceResourceId : ""),
      message: typeof finding.message === "string" ? finding.message : "",
      remediation: typeof finding.remediation === "string" ? finding.remediation : "",
      status: old?.status === "completed" ? "completed" : "pending",
      updatedAt: old?.updatedAt || null,
      findingPresent: true,
    });
  }
  const currentIds = new Set(next.map((task) => task.id));
  for (const task of loaded.tasks) {
    if (!currentIds.has(task.id)) next.push({ ...task, findingPresent: false });
  }
  const result = saveKubernetesRemediationChecklist(storage, next, key);
  return { ...result, tasks: result.ok ? result.tasks : next };
}

export function saveKubernetesRemediationChecklist(storage, tasks, key = KUBERNETES_REMEDIATION_CHECKLIST_KEY) {
  try {
    const target = safeStorage(storage);
    if (!target) return { ok: false, tasks: [] };
    const normalized = (Array.isArray(tasks) ? tasks : []).map(normalizeTask).filter(Boolean);
    target.setItem(key, JSON.stringify(normalized));
    return { ok: true, tasks: normalized };
  } catch {
    return { ok: false, tasks: [] };
  }
}

export function setKubernetesRemediationTaskStatus(storage, tasks, taskId, status, key = KUBERNETES_REMEDIATION_CHECKLIST_KEY) {
  if (status !== "pending" && status !== "completed") return { ok: false, tasks: Array.isArray(tasks) ? tasks : [] };
  const next = (Array.isArray(tasks) ? tasks : []).map((task) => task.id === taskId
    ? { ...task, status, updatedAt: new Date().toISOString() }
    : task);
  const result = saveKubernetesRemediationChecklist(storage, next, key);
  return { ...result, tasks: result.ok ? result.tasks : next };
}

export function summarizeKubernetesRemediationChecklist(tasks) {
  const safeTasks = (Array.isArray(tasks) ? tasks : []).map(normalizeTask).filter(Boolean);
  const completed = safeTasks.filter((task) => task.status === "completed").length;
  const total = safeTasks.length;
  return {
    total,
    pending: safeTasks.filter((task) => task.status === "pending").length,
    completed,
    errors: safeTasks.filter((task) => task.severity === "error" && task.status === "pending").length,
    active: safeTasks.filter((task) => task.findingPresent).length,
    resolved: safeTasks.filter((task) => !task.findingPresent).length,
    pendingResolved: safeTasks.filter((task) => !task.findingPresent && task.status === "pending").length,
    progressPercent: total ? Math.round((completed / total) * 100) : 0,
  };
}

export function buildKubernetesRemediationChecklistExport(tasks, generatedAt) {
  const safeTasks = (Array.isArray(tasks) ? tasks : []).map(normalizeTask).filter(Boolean);
  const summary = summarizeKubernetesRemediationChecklist(safeTasks);
  return {
    reportType: "sketchizi-kubernetes-remediation-checklist",
    generatedAt: generatedAt || new Date().toISOString(),
    summary,
    tasks: safeTasks,
    scopeNote: "This is a user-managed checklist based on diagram-validation findings. It does not apply changes to Kubernetes resources or verify a live cluster.",
    privacyNote: "The export contains sanitized finding fields only; it excludes the full diagram and arbitrary metadata.",
  };
}

export function renderKubernetesRemediationChecklistMarkdown(report) {
  const safeReport = report && typeof report === "object" ? report : {};
  const summary = safeReport.summary || {};
  const tasks = Array.isArray(safeReport.tasks) ? safeReport.tasks : [];
  const clean = (value) => (typeof value === "string" ? value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|") : "");
  const lines = [
    "# Sketchizi Kubernetes Remediation Checklist", "",
    `- Generated: ${clean(safeReport.generatedAt || "unknown")}`,
    `- Total tasks: ${Number(summary.total) || 0}`,
    `- Pending: ${Number(summary.pending) || 0}`,
    `- Completed: ${Number(summary.completed) || 0}`,
    `- Pending errors: ${Number(summary.errors) || 0}`,
    `- Active findings: ${Number(summary.active) || 0}`,
    `- Resolved findings: ${Number(summary.resolved) || 0}`,
    `- Pending tasks for resolved findings: ${Number(summary.pendingResolved) || 0}`,
    `- Checklist completion: ${Number(summary.progressPercent) || 0}%`, "",
    "## Tasks", "",
  ];
  if (!tasks.length) lines.push("_No current findings to track._");
  for (const task of tasks) {
    lines.push(`- [${task.status === "completed" ? "x" : " "}] **${clean(task.code || "Finding")}** (${clean(task.severity)}) — ${clean(task.message || "No message provided")}`);
    lines.push(`  - Finding state: ${task.findingPresent === false ? "Resolved in current diagram validation" : "Present in current diagram validation"}`);
    if (task.resourceId) lines.push(`  - Resource: ${clean(task.resourceId)}`);
    if (task.remediation) lines.push(`  - Remediation: ${clean(task.remediation)}`);
  }
  lines.push("", "## Scope and privacy", "", clean(safeReport.scopeNote), "", clean(safeReport.privacyNote), "");
  return lines.join("\n");
}
