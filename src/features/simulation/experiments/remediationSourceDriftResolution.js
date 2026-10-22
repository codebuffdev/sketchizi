import { evaluateRemediationMeasurementSourceDrift } from "./remediationEvidenceMapping.js";

const DISPOSITIONS = new Set(["acceptable-context", "requires-reverification"]);
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value, max = 1200) => String(value ?? "").trim().slice(0, max);
const validDate = (value, fallback = new Date().toISOString()) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;

function normalizeSnapshot(value) {
  if (!isRecord(value)) return null;
  const metadata = isRecord(value.recordMetadata) ? value.recordMetadata : {};
  const workload = isRecord(value.workload) ? value.workload : {};
  const definition = isRecord(value.fieldDefinition) ? value.fieldDefinition : null;
  return {
    schemaVersion: Number.isSafeInteger(value.schemaVersion) ? value.schemaVersion : null,
    recordId: text(value.recordId, 140),
    recordMetadata: {
      name: text(metadata.name, 180), testedAt: text(metadata.testedAt, 40),
      targetEnvironment: text(metadata.targetEnvironment, 180), source: text(metadata.source, 120),
    },
    workload: {
      durationSeconds: Number.isFinite(workload.durationSeconds) ? workload.durationSeconds : null,
      offeredRps: Number.isFinite(workload.offeredRps) ? workload.offeredRps : null,
      concurrency: Number.isFinite(workload.concurrency) ? workload.concurrency : null,
    },
    fieldDefinition: definition ? {
      key: text(definition.key, 120), label: text(definition.label, 180),
      min: Number.isFinite(definition.min) ? definition.min : null,
      max: Number.isFinite(definition.max) ? definition.max : null,
      step: Number.isFinite(definition.step) ? definition.step : null,
      group: text(definition.group, 60),
    } : null,
    fieldPresent: value.fieldPresent === true,
    sourceField: text(value.sourceField, 240),
    sourceValue: Number.isFinite(value.sourceValue) ? value.sourceValue : null,
    transformation: text(value.transformation, 180),
  };
}

function stableFingerprint(value) {
  const serialized = JSON.stringify(value);
  let a = 2166136261;
  let b = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    a = Math.imul(a ^ code, 16777619);
    b = Math.imul(b ^ code, 2246822519);
  }
  return `drift-${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}

function normalizeChange(change) {
  if (!isRecord(change)) return null;
  return {
    type: text(change.type, 80), label: text(change.label, 180), detail: text(change.detail, 1000),
    fields: Array.isArray(change.fields) ? change.fields.map((field) => text(field, 100)).filter(Boolean).slice(0, 20) : [],
    baselineValue: Number.isFinite(change.baselineValue) ? change.baselineValue : null,
    currentValue: Number.isFinite(change.currentValue) ? change.currentValue : null,
  };
}

export function normalizeRemediationSourceDriftReviews(value) {
  return (Array.isArray(value) ? value : []).filter(isRecord).map((review) => ({
    id: text(review.id, 140),
    runId: text(review.runId, 140),
    metricKey: text(review.metricKey, 100),
    metricLabel: text(review.metricLabel, 180),
    side: review.side === "before" || review.side === "after" ? review.side : "before",
    sourceRecordId: text(review.sourceRecordId, 140),
    fingerprint: text(review.fingerprint, 40),
    disposition: DISPOSITIONS.has(review.disposition) ? review.disposition : "requires-reverification",
    reviewer: text(review.reviewer, 120),
    rationale: text(review.rationale, 1200),
    reviewedAt: validDate(review.reviewedAt),
    originalSnapshot: normalizeSnapshot(review.originalSnapshot),
    currentSnapshot: normalizeSnapshot(review.currentSnapshot),
    changes: (Array.isArray(review.changes) ? review.changes : []).map(normalizeChange).filter(Boolean).slice(0, 12),
    sourceDriftStatus: text(review.sourceDriftStatus, 60),
  })).filter((review) => review.id && review.runId && review.metricKey && review.fingerprint).slice(-100);
}

/** Only a display-name-only edit can be reviewed as non-material context. */
export function canAcceptRemediationSourceDriftAsContext(item) {
  if (!isRecord(item) || item.state !== "changed" || !Array.isArray(item.changes) || item.changes.length === 0) return false;
  return item.changes.every((change) => change.type === "metadata-changed"
    && Array.isArray(change.fields) && change.fields.length > 0
    && change.fields.every((field) => field === "name"));
}

export function fingerprintRemediationSourceDriftItem(item) {
  if (!isRecord(item)) return "";
  return stableFingerprint({
    metricKey: item.metricKey, side: item.side, sourceRecordId: item.sourceRecordId,
    state: item.state, originalSnapshot: normalizeSnapshot(item.originalSnapshot),
    currentSnapshot: normalizeSnapshot(item.currentSnapshot),
    changes: (Array.isArray(item.changes) ? item.changes : []).map(normalizeChange).filter(Boolean),
  });
}

function currentReviewForItem(reviews, runId, item, fingerprint) {
  return (Array.isArray(reviews) ? reviews : []).filter((review) => review.runId === runId
    && review.metricKey === item.metricKey && review.side === item.side
    && review.sourceRecordId === item.sourceRecordId && review.fingerprint === fingerprint).at(-1) || null;
}

export function summarizeRemediationSourceDriftResolution(findingValue, runId, loadTestRecords) {
  const finding = isRecord(findingValue) ? findingValue : {};
  const run = (Array.isArray(finding.verificationRuns) ? finding.verificationRuns : []).find((entry) => entry?.id === runId);
  if (!run) return { status: "not-evaluated", reason: "Verification run was not found.", runId, items: [], canUseHistoricalConfirmation: false };
  const evaluation = evaluateRemediationMeasurementSourceDrift(run.measurementSources, loadTestRecords);
  const reviews = normalizeRemediationSourceDriftReviews(finding.sourceDriftReviews);
  const items = evaluation.items.filter((item) => item.state !== "unchanged").map((item) => {
    const fingerprint = fingerprintRemediationSourceDriftItem(item);
    const latestReview = currentReviewForItem(reviews, runId, item, fingerprint);
    return {
      ...item, fingerprint, canAcceptAsContext: canAcceptRemediationSourceDriftAsContext(item),
      latestReview,
      reviewState: latestReview ? `reviewed-${latestReview.disposition}` : "needs-review",
      reviewHistory: reviews.filter((review) => review.runId === runId && review.metricKey === item.metricKey
        && review.side === item.side && review.sourceRecordId === item.sourceRecordId).slice(-10),
    };
  });
  const pending = items.filter((item) => !item.latestReview).length;
  const requireRerun = items.filter((item) => !item.canAcceptAsContext
    || item.latestReview?.disposition !== "acceptable-context").length;
  const status = ["not-applicable", "not-evaluated", "unchanged"].includes(evaluation.status)
    ? evaluation.status : pending ? "needs-review" : requireRerun ? "reverification-required" : "accepted-context";
  return {
    status, reason: evaluation.reason, runId, items,
    pendingCount: pending, reverifyCount: items.filter((item) => item.latestReview?.disposition === "requires-reverification").length,
    canUseHistoricalConfirmation: evaluation.status === "drift-detected" && items.length > 0 && pending === 0
      && items.every((item) => item.canAcceptAsContext && item.latestReview?.disposition === "acceptable-context"),
    independentlyVerified: false,
  };
}

/** Record a reviewer disposition against the exact source snapshot being compared. */
export function createRemediationSourceDriftReview(input, item, runId, { reviewedAt = new Date().toISOString() } = {}) {
  if (!isRecord(input) || !isRecord(item)) throw new TypeError("A current source drift item and review details are required.");
  const disposition = text(input.disposition, 60);
  if (!DISPOSITIONS.has(disposition)) throw new TypeError(`Unsupported source drift disposition: ${disposition || "(empty)"}.`);
  if (disposition === "acceptable-context" && !canAcceptRemediationSourceDriftAsContext(item)) {
    throw new Error("Only a source record display-name-only change may be accepted as non-material context. Value, field-definition, workload, missing-source, and incomplete-snapshot changes require a new verification run.");
  }
  const reviewer = text(input.reviewer, 120);
  const rationale = text(input.rationale, 1200);
  if (!reviewer || !rationale) throw new Error("A reviewer and rationale are required to record a source drift disposition.");
  const fingerprint = fingerprintRemediationSourceDriftItem(item);
  if (!fingerprint) throw new Error("Could not fingerprint the current source drift item.");
  return {
    id: `source-drift-review-${stableFingerprint(`${runId}|${item.metricKey}|${item.side}|${fingerprint}|${reviewedAt}|${reviewer}`)}`,
    runId: text(runId, 140), metricKey: text(item.metricKey, 100), metricLabel: text(item.metricLabel, 180),
    side: item.side === "after" ? "after" : "before", sourceRecordId: text(item.sourceRecordId, 140), fingerprint,
    disposition, reviewer, rationale, reviewedAt: validDate(reviewedAt),
    originalSnapshot: normalizeSnapshot(item.originalSnapshot), currentSnapshot: normalizeSnapshot(item.currentSnapshot),
    changes: (Array.isArray(item.changes) ? item.changes : []).map(normalizeChange).filter(Boolean).slice(0, 12),
    sourceDriftStatus: text(item.state, 60),
  };
}

/** Re-evaluate all current changed source items; historical review does not transfer to a new fingerprint. */
export function remediationSourceDriftCanStayVerified(findingValue, runId, loadTestRecords) {
  const summary = summarizeRemediationSourceDriftResolution(findingValue, runId, loadTestRecords);
  if (summary.status === "not-applicable" || summary.status === "not-evaluated") return summary.status === "not-applicable";
  return summary.status === "unchanged" || summary.status === "not-applicable" || summary.canUseHistoricalConfirmation;
}

export const REMEDIATION_SOURCE_DRIFT_DISPOSITION_OPTIONS = Object.freeze([
  { value: "acceptable-context", label: "Accept as non-material context (display name only)" },
  { value: "requires-reverification", label: "Requires a new verification run" },
]);
