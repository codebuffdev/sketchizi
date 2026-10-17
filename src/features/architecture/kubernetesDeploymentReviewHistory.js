export const KUBERNETES_REVIEW_HISTORY_KEY = "sketchizi:kubernetes-review-history:v1";
export const KUBERNETES_REVIEW_HISTORY_LIMIT = 10;

function isValidSnapshot(snapshot) {
  return Boolean(snapshot &&
    snapshot.reportType === "sketchizi-kubernetes-deployment-review" &&
    Array.isArray(snapshot.findings) &&
    snapshot.summary &&
    typeof snapshot.summary.total === "number");
}

/**
 * Read the bounded history from a Web Storage-compatible adapter.
 * Storage failures and malformed persisted data safely return an empty list.
 */
export function loadKubernetesReviewHistory(storage, key = KUBERNETES_REVIEW_HISTORY_KEY) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => isValidSnapshot(entry?.snapshot) && typeof entry?.savedAt === "string")
      .slice(0, KUBERNETES_REVIEW_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

/**
 * Persist newest-first sanitized snapshots. Only the report allowlist is
 * retained; callers should pass buildKubernetesDeploymentReviewExport output.
 */
export function saveKubernetesReviewSnapshot(storage, snapshot, options = {}) {
  const key = options.key || KUBERNETES_REVIEW_HISTORY_KEY;
  const savedAt = options.savedAt || new Date().toISOString();
  if (!isValidSnapshot(snapshot)) return { ok: false, history: loadKubernetesReviewHistory(storage, key) };
  try {
    const previous = loadKubernetesReviewHistory(storage, key);
    const entry = {
      id: `${savedAt}:${snapshot.generatedAt || ""}:${snapshot.summary.total}`,
      savedAt,
      snapshot,
    };
    const history = [entry, ...previous].slice(0, KUBERNETES_REVIEW_HISTORY_LIMIT);
    storage.setItem(key, JSON.stringify(history));
    return { ok: true, history };
  } catch {
    return { ok: false, history: loadKubernetesReviewHistory(storage, key) };
  }
}

export function deleteKubernetesReviewSnapshot(storage, snapshotId, key = KUBERNETES_REVIEW_HISTORY_KEY) {
  try {
    const history = loadKubernetesReviewHistory(storage, key).filter((entry) => entry.id !== snapshotId);
    storage.setItem(key, JSON.stringify(history));
    return { ok: true, history };
  } catch {
    return { ok: false, history: loadKubernetesReviewHistory(storage, key) };
  }
}


export function summarizeKubernetesReviewHistory(history) {
  const entries = Array.isArray(history) ? history : [];
  return entries.map((entry) => {
    const snapshot = entry?.snapshot || {};
    const summary = snapshot.summary || {};
    return {
      id: entry?.id || "",
      savedAt: entry?.savedAt || "",
      total: Number(summary.total) || 0,
      errors: Number(summary.errors) || 0,
      warnings: Number(summary.warnings) || 0,
      info: Number(summary.info) || 0,
      reviewed: Number(summary.reviewed) || 0,
      unreviewed: Number(summary.unreviewed) || 0,
      resolved: Number(summary.resolved) || 0,
      title: snapshot.title || "Kubernetes review",
    };
  });
}
