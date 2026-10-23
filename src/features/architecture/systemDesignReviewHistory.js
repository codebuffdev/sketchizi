import { normalizeReviewSession } from "./systemDesignReviewWorkflow.js";

const HISTORY_KEY = "sketchizi.system-design-review-history.v1";
const MAX_REVIEWS = 100;
const MAX_EVENTS = 500;
const clean = (value, max = 500) => String(value ?? "").trim().slice(0, max);

export function normalizeReviewHistory(value) {
  const source = value && typeof value === "object" ? value : {};
  const reviews = Array.isArray(source.reviews) ? source.reviews.slice(0, MAX_REVIEWS).map((item) => {
    const session = normalizeReviewSession(item?.session);
    if (!session) return null;
    return { id: clean(item.id, 120) || session.id, revision: Math.max(1, Number(item.revision) || 1), action: clean(item.action, 80) || "saved", recordedAt: clean(item.recordedAt, 40) || session.updatedAt, session };
  }).filter(Boolean) : [];
  const events = Array.isArray(source.events) ? source.events.slice(-MAX_EVENTS).map((item) => ({ id: clean(item?.id, 120), reviewId: clean(item?.reviewId, 120), action: clean(item?.action, 80), at: clean(item?.at, 40), status: clean(item?.status, 30), summary: clean(item?.summary, 500) })) : [];
  return { schemaVersion: 1, reviews, events };
}

export function loadSystemDesignReviewHistory(storage = globalThis.localStorage) {
  try { return normalizeReviewHistory(JSON.parse(storage?.getItem(HISTORY_KEY) || "null")); } catch { return normalizeReviewHistory(null); }
}

export function saveSystemDesignReviewHistory(history, storage = globalThis.localStorage) {
  const normalized = normalizeReviewHistory(history);
  try { storage?.setItem(HISTORY_KEY, JSON.stringify(normalized)); return normalized; }
  catch { throw new Error("Could not save review history in browser storage."); }
}

export function recordSystemDesignReview(history, session, action = "saved", now = new Date().toISOString()) {
  const current = normalizeReviewHistory(history);
  const normalizedSession = normalizeReviewSession(session);
  if (!normalizedSession) throw new Error("A valid review session is required for history.");
  const existing = current.reviews.find((item) => item.session.id === normalizedSession.id);
  const revision = (existing?.revision || 0) + 1;
  const snapshot = { id: `${normalizedSession.id}-revision-${revision}`, revision, action: clean(action, 80), recordedAt: now, session: normalizedSession };
  const reviews = [snapshot, ...current.reviews.filter((item) => item.id !== snapshot.id)].slice(0, MAX_REVIEWS);
  const event = { id: `${normalizedSession.id}-${now}-${revision}`, reviewId: normalizedSession.id, action: snapshot.action, at: now, status: normalizedSession.status, summary: `${normalizedSession.title}: ${normalizedSession.findings.length} findings, ${normalizedSession.remediation.length} remediation tasks` };
  return normalizeReviewHistory({ reviews, events: [...current.events, event] });
}

export function compareSystemDesignReviewSnapshots(older, newer) {
  const a = normalizeReviewSession(older?.session || older);
  const b = normalizeReviewSession(newer?.session || newer);
  if (!a || !b) throw new Error("Two valid review snapshots are required.");
  const findingMap = (session) => new Map(session.findings.map((item) => [item.id || `${item.code}:${item.message}`, item]));
  const before = findingMap(a), after = findingMap(b);
  const addedFindings = [...after].filter(([id]) => !before.has(id)).map(([, item]) => item);
  const removedFindings = [...before].filter(([id]) => !after.has(id)).map(([, item]) => item);
  const changedFindings = [...after].filter(([id, item]) => before.has(id) && (before.get(id).status !== item.status || before.get(id).severity !== item.severity)).map(([id, item]) => ({ id, before: before.get(id), after: item }));
  return { olderReviewId: a.id, newerReviewId: b.id, componentCountDelta: (b.snapshot?.nodes?.length || 0) - (a.snapshot?.nodes?.length || 0), connectionCountDelta: (b.snapshot?.edges?.length || 0) - (a.snapshot?.edges?.length || 0), addedFindings, removedFindings, changedFindings, statusChanged: a.status !== b.status, fromStatus: a.status, toStatus: b.status };
}

export function renderSystemDesignReviewAuditMarkdown(history) {
  const h = normalizeReviewHistory(history);
  const lines = ["# Sketchizi Architecture Review Audit Trail", "", `- Review snapshots retained: ${h.reviews.length}`, `- Audit events retained: ${h.events.length}`, "", "## Events", ""];
  for (const event of h.events.slice().reverse()) lines.push(`- **${event.at}** — ${event.action} — ${event.summary} (status: ${event.status})`);
  if (!h.events.length) lines.push("No review events recorded.");
  lines.push("", "## Retained snapshots", "");
  for (const review of h.reviews) lines.push(`- ${review.session.title} — revision ${review.revision}, ${review.action}, ${review.recordedAt}, status ${review.session.status}`);
  lines.push("", "This locally stored audit trail is browser-specific and is not a tamper-proof compliance log.", "");
  return lines.join("\n");
}
