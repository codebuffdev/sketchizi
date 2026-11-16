const STORAGE_KEY = "sketchizi.system-design-review-collaboration.v1";
const text = (value, limit = 2000) => String(value ?? "").trim().slice(0, limit);
const REVIEW_STATES = new Set(["pending", "approved", "changes_requested"]);

export function normalizeReviewCollaboration(value, reviewId = "") {
  const source = value && typeof value === "object" ? value : {};
  return {
    schemaVersion: 1,
    reviewId: text(source.reviewId || reviewId, 180),
    owner: text(source.owner, 120),
    reviewers: Array.isArray(source.reviewers) ? source.reviewers.slice(0, 100).map((reviewer, index) => ({
      id: text(reviewer?.id, 180) || `reviewer-${index + 1}`,
      name: text(reviewer?.name, 120),
      role: text(reviewer?.role, 120),
      status: REVIEW_STATES.has(reviewer?.status) ? reviewer.status : "pending",
      note: text(reviewer?.note, 2000),
      updatedAt: text(reviewer?.updatedAt, 40),
    })).filter((reviewer) => reviewer.name) : [],
    comments: Array.isArray(source.comments) ? source.comments.slice(-500).map((comment, index) => ({
      id: text(comment?.id, 180) || `comment-${index + 1}`,
      author: text(comment?.author, 120) || "Reviewer",
      body: text(comment?.body, 4000),
      findingId: text(comment?.findingId, 180),
      createdAt: text(comment?.createdAt, 40) || new Date().toISOString(),
    })).filter((comment) => comment.body) : [],
    updatedAt: text(source.updatedAt, 40) || new Date().toISOString(),
  };
}

export function loadReviewCollaboration(reviewId, storage = globalThis.localStorage) {
  if (!reviewId) return normalizeReviewCollaboration(null, "");
  try {
    const all = JSON.parse(storage?.getItem(STORAGE_KEY) || "{}");
    return normalizeReviewCollaboration(all?.[reviewId], reviewId);
  } catch { return normalizeReviewCollaboration(null, reviewId); }
}

export function saveReviewCollaboration(value, storage = globalThis.localStorage, now = new Date().toISOString()) {
  const normalized = normalizeReviewCollaboration({ ...value, updatedAt: now }, value?.reviewId);
  if (!normalized.reviewId) throw new Error("A review session is required for collaboration data.");
  try {
    const all = JSON.parse(storage?.getItem(STORAGE_KEY) || "{}");
    all[normalized.reviewId] = normalized;
    const entries = Object.entries(all).slice(-100);
    storage?.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
    return normalized;
  } catch { throw new Error("Could not save collaboration data in browser storage."); }
}

export function addReviewCollaborator(value, reviewer, now = new Date().toISOString()) {
  const current = normalizeReviewCollaboration(value, value?.reviewId);
  const name = text(reviewer?.name, 120);
  if (!name) throw new Error("Enter a reviewer name.");
  const id = text(reviewer?.id, 180) || `reviewer-${Date.now()}`;
  const existing = current.reviewers.find((item) => item.id === id || item.name.toLowerCase() === name.toLowerCase());
  const normalizedReviewer = { id: existing?.id || id, name, role: text(reviewer?.role, 120), status: existing?.status || "pending", note: existing?.note || "", updatedAt: now };
  return normalizeReviewCollaboration({ ...current, reviewers: existing ? current.reviewers.map((item) => item.id === existing.id ? normalizedReviewer : item) : [...current.reviewers, normalizedReviewer], updatedAt: now });
}

export function setReviewSignoff(value, reviewerId, status, note = "", now = new Date().toISOString()) {
  if (!REVIEW_STATES.has(status)) throw new Error("Choose pending, approved, or changes requested.");
  const current = normalizeReviewCollaboration(value, value?.reviewId);
  if (!current.reviewers.some((item) => item.id === reviewerId)) throw new Error("Reviewer not found.");
  return normalizeReviewCollaboration({ ...current, reviewers: current.reviewers.map((item) => item.id === reviewerId ? { ...item, status, note: text(note, 2000), updatedAt: now } : item), updatedAt: now });
}

export function addReviewComment(value, { author, body, findingId = "" } = {}, now = new Date().toISOString()) {
  const current = normalizeReviewCollaboration(value, value?.reviewId);
  const content = text(body, 4000);
  if (!content) throw new Error("Enter a comment before posting.");
  const comment = { id: `comment-${Date.now()}-${current.comments.length}`, author: text(author, 120) || "Reviewer", body: content, findingId: text(findingId, 180), createdAt: now };
  return normalizeReviewCollaboration({ ...current, comments: [...current.comments, comment], updatedAt: now });
}

export function summarizeReviewSignoff(value) {
  const collaboration = normalizeReviewCollaboration(value, value?.reviewId);
  const approved = collaboration.reviewers.filter((reviewer) => reviewer.status === "approved").length;
  const requestedChanges = collaboration.reviewers.filter((reviewer) => reviewer.status === "changes_requested").length;
  return { total: collaboration.reviewers.length, approved, pending: collaboration.reviewers.filter((reviewer) => reviewer.status === "pending").length, requestedChanges, readyForSignoff: collaboration.reviewers.length > 0 && approved === collaboration.reviewers.length };
}

export function renderReviewCollaborationMarkdown(value) {
  const collaboration = normalizeReviewCollaboration(value, value?.reviewId);
  const clean = (entry) => String(entry || "").replace(/[\r\n]+/g, " ");
  const lines = [`# Review collaboration`, "", `- Review ID: ${clean(collaboration.reviewId)}`, `- Owner: ${clean(collaboration.owner) || "Unassigned"}`, "", "## Reviewer sign-off", ""];
  if (!collaboration.reviewers.length) lines.push("No reviewers assigned.");
  else for (const reviewer of collaboration.reviewers) lines.push(`- **${clean(reviewer.name)}**${reviewer.role ? ` (${clean(reviewer.role)})` : ""}: ${reviewer.status}${reviewer.note ? ` — ${clean(reviewer.note)}` : ""}`);
  lines.push("", "## Comments", "");
  if (!collaboration.comments.length) lines.push("No comments yet.");
  else for (const comment of collaboration.comments) lines.push(`- ${comment.createdAt} — **${clean(comment.author)}**${comment.findingId ? ` [finding ${clean(comment.findingId)}]` : ""}: ${clean(comment.body)}`);
  lines.push("", "Collaboration data is stored in this browser only; it is not synchronized to other users and is not a tamper-proof audit log.", "");
  return lines.join("\n");
}
