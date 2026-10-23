const STORAGE_KEY = "sketchizi.system-design-review-workflow.v1";
const STATUSES = new Set(["draft", "in_review", "finalized"]);
const text = (value, limit = 5000) => String(value ?? "").trim().slice(0, limit);

export function normalizeReviewSession(value) {
  if (!value || typeof value !== "object") return null;
  const status = STATUSES.has(value.status) ? value.status : "draft";
  return {
    schemaVersion: 1,
    id: text(value.id, 100) || `review-${Date.now()}`,
    title: text(value.title, 160) || "Architecture review",
    owner: text(value.owner, 120),
    status,
    createdAt: text(value.createdAt, 40) || new Date().toISOString(),
    updatedAt: text(value.updatedAt, 40) || new Date().toISOString(),
    finalizedAt: status === "finalized" ? text(value.finalizedAt, 40) || new Date().toISOString() : null,
    snapshot: value.snapshot && typeof value.snapshot === "object" ? value.snapshot : null,
    findings: Array.isArray(value.findings) ? value.findings.slice(0, 1000).map((item) => ({ id: text(item?.id, 180), severity: text(item?.severity, 30), code: text(item?.code, 120), message: text(item?.message, 2000), status: ["open", "accepted", "resolved", "deferred"].includes(item?.status) ? item.status : "open", note: text(item?.note, 2000) })) : [],
    decisions: Array.isArray(value.decisions) ? value.decisions.slice(0, 500).map((item) => ({ id: text(item?.id, 180), title: text(item?.title, 200), status: text(item?.status, 40) })) : [],
    remediation: Array.isArray(value.remediation) ? value.remediation.slice(0, 1000).map((item) => ({ id: text(item?.id, 180), title: text(item?.title, 500), status: ["pending", "in_progress", "completed", "deferred"].includes(item?.status) ? item.status : "pending" })) : [],
    notes: text(value.notes, 10000),
  };
}

export function createReviewSession({ title, owner = "", graph, diagnostics = [], decisions = [], remediation = [], notes = "", now = new Date().toISOString(), id = `review-${Date.now()}` } = {}) {
  return normalizeReviewSession({ id, title, owner, status: "draft", createdAt: now, updatedAt: now, snapshot: { nodes: graph?.nodes || [], edges: graph?.edges || [] }, findings: diagnostics.map((item, index) => ({ id: String(item?.diagnosticId || item?.code || `finding-${index}`), severity: item?.severity || "info", code: item?.code || "UNKNOWN", message: item?.message || item?.title || "Finding", status: "open", note: "" })), decisions: decisions.map((item, index) => ({ id: String(item?.id || `decision-${index}`), title: item?.title || "Untitled decision", status: item?.status || "proposed" })), remediation: remediation.map((item, index) => ({ id: String(item?.id || `task-${index}`), title: item?.message || item?.title || "Remediation task", status: item?.status === "completed" ? "completed" : "pending" })), notes, now });
}

export function updateReviewSession(session, patch = {}, now = new Date().toISOString()) {
  if (!session) throw new Error("Start a review session before updating it.");
  if (session.status === "finalized") throw new Error("Finalized reviews are read-only. Start a new review to make changes.");
  const next = normalizeReviewSession({ ...session, ...patch, status: patch.status || "in_review", updatedAt: now, finalizedAt: null });
  return next;
}

export function finalizeReviewSession(session, now = new Date().toISOString()) {
  if (!session) throw new Error("Start a review session before finalizing it.");
  if (session.status === "finalized") return session;
  return normalizeReviewSession({ ...session, status: "finalized", updatedAt: now, finalizedAt: now });
}

export function loadReviewSession(storage = globalThis.localStorage) {
  try { return normalizeReviewSession(JSON.parse(storage?.getItem(STORAGE_KEY) || "null")); } catch { return null; }
}
export function saveReviewSession(session, storage = globalThis.localStorage) {
  const normalized = normalizeReviewSession(session);
  if (!normalized) throw new Error("A valid review session is required.");
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(normalized)); return normalized; } catch { throw new Error("Could not save the review session in browser storage."); }
}
export function exportReviewSession(session) {
  if (!session) throw new Error("There is no review session to export.");
  return { ...normalizeReviewSession(session), exportedAt: new Date().toISOString(), exportSchema: "sketchizi-review-workflow/v1" };
}
export function renderReviewSessionMarkdown(session) {
  const s = exportReviewSession(session);
  const clean = (v) => String(v || "").replace(/[\r\n]+/g, " ");
  const lines = [`# ${clean(s.title)}`, "", `- Status: ${s.status}`, `- Owner: ${clean(s.owner) || "Unassigned"}`, `- Created: ${s.createdAt}`, `- Updated: ${s.updatedAt}`, `- Finalized: ${s.finalizedAt || "Not finalized"}`, "", "## Review summary", "", `- Components: ${s.snapshot?.nodes?.length || 0}`, `- Connections: ${s.snapshot?.edges?.length || 0}`, `- Findings: ${s.findings.length}`, `- Decisions referenced: ${s.decisions.length}`, `- Remediation tasks: ${s.remediation.length}`, "", "## Findings", ""];
  for (const f of s.findings) lines.push(`### [${clean(f.severity).toUpperCase()}] ${clean(f.code)}`, "", clean(f.message), `Status: ${f.status}`, ...(f.note ? [`Note: ${clean(f.note)}`] : []), "");
  lines.push("## Remediation", "", ...s.remediation.map((t) => `- [${t.status === "completed" ? "x" : " "}] ${clean(t.title)}`), "", "## Notes", "", clean(s.notes) || "No additional notes.", "", "This report records a design review; it is not a production-readiness certification.", "");
  return lines.join("\n");
}
