const STORAGE_KEY = "sketchizi.system-design.adr.v1";
const STATUSES = new Set(["proposed", "accepted", "rejected", "superseded"]);
const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);

export function normalizeDecisionRecord(input = {}) {
  const title = text(input.title, 160);
  if (!title) throw new Error("Decision title is required.");
  const status = STATUSES.has(input.status) ? input.status : "proposed";
  return {
    id: text(input.id, 100) || `adr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    status,
    context: text(input.context),
    decision: text(input.decision),
    consequences: text(input.consequences),
    alternatives: text(input.alternatives),
    linkedComponentIds: [...new Set((Array.isArray(input.linkedComponentIds) ? input.linkedComponentIds : []).map((id) => text(id, 160)).filter(Boolean))].slice(0, 50),
    createdAt: Number.isFinite(input.createdAt) ? input.createdAt : Date.now(),
    updatedAt: Date.now(),
  };
}

export function loadDecisionRecords(storage) {
  if (!storage || typeof storage.getItem !== "function") return [];
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => { try { return normalizeDecisionRecord(item); } catch { return null; } }).filter(Boolean).slice(0, 100);
  } catch { return []; }
}

export function saveDecisionRecords(storage, records) {
  if (!storage || typeof storage.setItem !== "function") return false;
  try {
    const safe = (Array.isArray(records) ? records : []).slice(0, 100).map(normalizeDecisionRecord);
    storage.setItem(STORAGE_KEY, JSON.stringify(safe));
    return true;
  } catch { return false; }
}

export function buildDecisionRecordExport(records) {
  return { schemaVersion: 1, exportedAt: new Date().toISOString(), records: (Array.isArray(records) ? records : []).map((record) => normalizeDecisionRecord(record)) };
}
