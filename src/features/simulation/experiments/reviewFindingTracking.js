import { acceptanceCriteriaEqual, evaluateRemediationAcceptanceCriteria, normalizeRemediationAcceptanceCriteria, normalizeRemediationMeasurements, validateRemediationAcceptanceCriteria, validateRemediationMeasurements } from "./remediationAcceptanceCriteria.js";
import { captureRemediationMeasurementSources, evaluateRemediationMeasurementSourceDrift, evaluateRemediationMeasurementSources, normalizeRemediationMeasurementSources, summarizeRemediationMeasurementSourceEvaluation } from "./remediationEvidenceMapping.js";
import { createRemediationSourceDriftReview, normalizeRemediationSourceDriftReviews, remediationSourceDriftCanStayVerified, summarizeRemediationSourceDriftResolution } from "./remediationSourceDriftResolution.js";

const STATUSES = new Set(["open", "accepted-risk", "resolved"]);
const SEVERITIES = new Set(["error", "warning", "info"]);
const MAX_TRACKED_FINDINGS = 100;
const MAX_FINDING_AUDIT_EVENTS = 25;
const MAX_VERIFICATION_RUNS = 20;
const VERIFICATION_RUN_TYPES = new Set(["regression-test", "load-test", "monitoring", "manual-check", "other"]);
const VERIFICATION_OUTCOMES = new Set(["pass", "fail", "inconclusive"]);

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const safeArray = (value) => Array.isArray(value) ? value : [];
const boundedText = (value, maxLength = 600) => String(value ?? "").trim().slice(0, maxLength);
const safeDate = (value, fallback = new Date().toISOString()) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fallback;
const normalizedStatus = (value) => STATUSES.has(value) ? value : "open";
const normalizedSeverity = (value) => SEVERITIES.has(value) ? value : "warning";

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function createTrackedReviewFindingId(finding = {}) {
  const identity = [finding.code, finding.title, finding.detail].map((value) => boundedText(value, 1000)).join("\u001f");
  return `review-${stableHash(identity)}`;
}

function normalizeFindingEvent(event) {
  if (!isRecord(event)) return null;
  return {
    id: boundedText(event.id, 120),
    type: boundedText(event.type, 60),
    message: boundedText(event.message, 400),
    at: safeDate(event.at),
  };
}

export function normalizeDecisionReviewFindings(value) {
  return safeArray(value).filter(isRecord).slice(0, MAX_TRACKED_FINDINGS).map((finding) => {
    const createdAt = safeDate(finding.createdAt);
    const status = normalizedStatus(finding.status);
    const auditTrail = safeArray(finding.auditTrail).map(normalizeFindingEvent).filter(Boolean).slice(-MAX_FINDING_AUDIT_EVENTS);
    const sources = [...new Set(safeArray(finding.sourceBundleNames).map((source) => boundedText(source, 180)).filter(Boolean))].slice(-10);
    const sourceBundleObservations = safeArray(finding.sourceBundleObservations).filter(isRecord).map((observation) => ({
      key: boundedText(observation.key, 260),
      sourceName: boundedText(observation.sourceName, 180),
      recordId: boundedText(observation.recordId, 120),
      generatedAt: safeDate(observation.generatedAt, null),
      observedAt: safeDate(observation.observedAt, createdAt),
      findingSnapshot: isRecord(observation.findingSnapshot) ? {
        severity: normalizedSeverity(observation.findingSnapshot.severity),
        title: boundedText(observation.findingSnapshot.title, 240),
        detail: boundedText(observation.findingSnapshot.detail, 1200),
      } : null,
    })).filter((observation) => observation.key).slice(-20);
    const rawReoccurrence = isRecord(finding.reoccurrence) ? finding.reoccurrence : null;
    const reoccurrence = rawReoccurrence && ["unreviewed", "reopened"].includes(rawReoccurrence.state) ? {
      state: rawReoccurrence.state,
      detectedAt: safeDate(rawReoccurrence.detectedAt, createdAt),
      sourceBundleName: boundedText(rawReoccurrence.sourceBundleName, 180),
      previousStatus: ["accepted-risk", "resolved"].includes(rawReoccurrence.previousStatus) ? rawReoccurrence.previousStatus : "resolved",
      reviewedAt: rawReoccurrence.state === "reopened" ? safeDate(rawReoccurrence.reviewedAt, createdAt) : null,
    } : null;
    const verificationRuns = safeArray(finding.verificationRuns).filter(isRecord).map((run) => ({
      id: boundedText(run.id, 140),
      runType: VERIFICATION_RUN_TYPES.has(run.runType) ? run.runType : "other",
      outcome: VERIFICATION_OUTCOMES.has(run.outcome) ? run.outcome : "inconclusive",
      beforeState: boundedText(run.beforeState, 1000),
      afterState: boundedText(run.afterState, 1000),
      summary: boundedText(run.summary, 1600),
      evidence: boundedText(run.evidence, 1200),
      recordedBy: boundedText(run.recordedBy, 120),
      recordedAt: safeDate(run.recordedAt, createdAt),
      measurements: normalizeRemediationMeasurements(run.measurements),
      measurementSources: normalizeRemediationMeasurementSources(run.measurementSources),
      measurementSourceEvaluation: summarizeRemediationMeasurementSourceEvaluation(evaluateRemediationMeasurementSources(run.measurements, run.measurementSources)),
      acceptanceCriteriaSnapshot: normalizeRemediationAcceptanceCriteria(run.acceptanceCriteriaSnapshot),
      acceptanceEvaluation: evaluateRemediationAcceptanceCriteria(run.acceptanceCriteriaSnapshot, run.measurements),
      reviewerVerifiedAt: run.reviewerVerifiedAt ? safeDate(run.reviewerVerifiedAt, null) : null,
      reviewerVerifiedBy: boundedText(run.reviewerVerifiedBy, 120),
      verificationRationale: boundedText(run.verificationRationale, 1200),
      verificationSupersededAt: run.verificationSupersededAt ? safeDate(run.verificationSupersededAt, null) : null,
      verificationSupersededReason: boundedText(run.verificationSupersededReason, 600),
    })).filter((run) => run.id).slice(-MAX_VERIFICATION_RUNS);
    const rawVerification = isRecord(finding.remediationVerification) ? finding.remediationVerification : {};
    const remediationVerification = {
      status: ["verified", "superseded"].includes(rawVerification.status) ? rawVerification.status : "not-verified",
      runId: boundedText(rawVerification.runId, 140),
      verifiedAt: rawVerification.verifiedAt ? safeDate(rawVerification.verifiedAt, null) : null,
      verifiedBy: boundedText(rawVerification.verifiedBy, 120),
      rationale: boundedText(rawVerification.rationale, 1200),
      supersededAt: rawVerification.supersededAt ? safeDate(rawVerification.supersededAt, null) : null,
      supersededReason: boundedText(rawVerification.supersededReason, 600),
    };
    return {
      id: boundedText(finding.id || createTrackedReviewFindingId(finding), 120),
      code: boundedText(finding.code || "unclassified", 100),
      severity: normalizedSeverity(finding.severity),
      title: boundedText(finding.title || "Untitled review finding", 240),
      detail: boundedText(finding.detail, 1200),
      status,
      owner: boundedText(finding.owner, 120),
      rationale: boundedText(finding.rationale, 1600),
      evidence: boundedText(finding.evidence, 1200),
      sourceBundleNames: sources,
      sourceBundleObservations,
      reoccurrence,
      verificationRuns,
      remediationVerification,
      acceptanceCriteria: normalizeRemediationAcceptanceCriteria(finding.acceptanceCriteria),
      freshEvidenceRequired: finding.freshEvidenceRequired === true,
      previousEvidence: boundedText(finding.previousEvidence, 1200),
      freshEvidenceRequestedAt: finding.freshEvidenceRequestedAt ? safeDate(finding.freshEvidenceRequestedAt, null) : null,
      freshEvidenceAt: finding.freshEvidenceAt && !Number.isNaN(Date.parse(finding.freshEvidenceAt)) ? finding.freshEvidenceAt : null,
      sourceDriftReviews: normalizeRemediationSourceDriftReviews(finding.sourceDriftReviews),
      createdAt,
      updatedAt: safeDate(finding.updatedAt, createdAt),
      resolvedAt: status === "resolved" ? safeDate(finding.resolvedAt, safeDate(finding.updatedAt, createdAt)) : null,
      auditTrail,
    };
  });
}

function makeEvent(type, message, at) {
  return {
    id: `finding-event-${stableHash(`${type}|${message}|${at}|${Math.random()}`)}`,
    type,
    message: boundedText(message, 400),
    at,
  };
}

/** Add findings from an imported release-bundle review while preserving existing reviewer dispositions. */
export function mergeReleaseBundleReviewFindings(existingValue, review, { importedAt = new Date().toISOString(), sourceName } = {}) {
  const existing = normalizeDecisionReviewFindings(existingValue);
  if (!isRecord(review) || !Array.isArray(review.findings)) throw new TypeError("A completed release bundle review with findings is required.");
  const at = safeDate(importedAt);
  const normalizedSource = boundedText(sourceName || review.sourceName, 180) || "Imported release bundle";
  const bundleMetadata = isRecord(review.bundleMetadata) ? review.bundleMetadata : {};
  const bundleRecordId = boundedText(bundleMetadata.recordId, 120);
  const bundleGeneratedAt = safeDate(bundleMetadata.generatedAt, null);
  // A generated-at + record ID pair distinguishes a later export even when users
  // overwrite and re-import a file with the same filename.
  const observationKey = bundleGeneratedAt
    ? `bundle:${bundleRecordId || "unknown"}:${bundleGeneratedAt}`
    : `source:${normalizedSource}`;
  const observationBase = {
    key: observationKey,
    sourceName: normalizedSource,
    recordId: bundleRecordId,
    generatedAt: bundleGeneratedAt,
    observedAt: at,
  };
  const byId = new Map(existing.map((finding) => [finding.id, finding]));
  const next = [...existing];
  let added = 0;
  let reobserved = 0;
  let reoccurrencesDetected = 0;

  for (const raw of review.findings) {
    if (!isRecord(raw)) continue;
    const id = createTrackedReviewFindingId(raw);
    const exactPrior = byId.get(id);
    // Finding details can change between releases. Match a unique finding by code + title,
    // then by unique non-generic code, so detail diffs do not become unrelated records.
    const code = boundedText(raw.code || "unclassified", 100);
    const title = boundedText(raw.title || "Untitled review finding", 240);
    const byCodeAndTitle = next.filter((finding) => finding.code === code && finding.title === title);
    const byCode = code !== "unclassified" ? next.filter((finding) => finding.code === code) : [];
    const prior = exactPrior || (byCodeAndTitle.length === 1 ? byCodeAndTitle[0] : byCodeAndTitle.length === 0 && byCode.length === 1 ? byCode[0] : null);
    const findingObservation = {
      ...observationBase,
      findingSnapshot: {
        severity: normalizedSeverity(raw.severity),
        title,
        detail: boundedText(raw.detail, 1200),
      },
    };
    if (prior) {
      reobserved += 1;
      const sources = [...new Set([...prior.sourceBundleNames, normalizedSource])].slice(-10);
      const alreadyObserved = prior.sourceBundleObservations.some((item) => item.key === observationKey);
      const sourceWasNew = !prior.sourceBundleNames.includes(normalizedSource);
      // Legacy records from before observation fingerprints existed fall back to
      // filename identity until a new source is introduced.
      const generatedAfterPriorUpdate = bundleGeneratedAt && Date.parse(bundleGeneratedAt) > Date.parse(prior.updatedAt || prior.createdAt);
      const isNewObservation = !alreadyObserved && (bundleGeneratedAt ? (prior.sourceBundleObservations.length > 0 || sourceWasNew || generatedAfterPriorUpdate) : sourceWasNew);
      if (isNewObservation) {
        let reoccurrence = prior.reoccurrence;
        const previousGeneratedTimes = prior.sourceBundleObservations
          .map((item) => item.generatedAt && Date.parse(item.generatedAt))
          .filter((time) => Number.isFinite(time));
        const latestGeneratedAt = previousGeneratedTimes.length ? Math.max(...previousGeneratedTimes) : null;
        const isChronologicallyLater = bundleGeneratedAt
          ? (latestGeneratedAt === null || Date.parse(bundleGeneratedAt) > latestGeneratedAt)
          : sourceWasNew;
        const isPreviouslyClosed = (prior.status === "resolved" || prior.status === "accepted-risk") && isChronologicallyLater;
        const recurrenceUnreviewed = reoccurrence?.state === "unreviewed";
        if (isPreviouslyClosed && !recurrenceUnreviewed) {
          reoccurrence = {
            state: "unreviewed",
            detectedAt: at,
            sourceBundleName: normalizedSource,
            previousStatus: prior.status,
            reviewedAt: null,
          };
          reoccurrencesDetected += 1;
        }
        const message = isPreviouslyClosed
          ? `Finding reappeared in later bundle ${normalizedSource} after being marked ${prior.status}; reviewer action is required to reopen it.`
          : !isChronologicallyLater
            ? `Historical observation ${normalizedSource} was imported after a newer bundle; current finding details and disposition were preserved.`
            : `Finding seen again in ${normalizedSource}; current disposition preserved as ${prior.status}.`;
        const priorTimeline = prior.sourceBundleObservations.slice().sort((left, right) => Date.parse(left.generatedAt || left.observedAt) - Date.parse(right.generatedAt || right.observedAt));
        const previousSnapshot = priorTimeline.slice().reverse().find((item) => item.findingSnapshot)?.findingSnapshot || {
          severity: prior.severity, title: prior.title, detail: prior.detail,
        };
        const currentSnapshot = findingObservation.findingSnapshot;
        const changedSnapshotFields = ["severity", "title", "detail"].filter((field) => previousSnapshot[field] !== currentSnapshot[field]);
        const snapshotMessage = changedSnapshotFields.length
          ? `Finding details changed in ${normalizedSource}: ${changedSnapshotFields.map((field) => `${field} (${previousSnapshot[field] || "empty"} → ${currentSnapshot[field] || "empty"})`).join("; ")}.`
          : "Finding details are unchanged from the prior observed release bundle.";
        const appliesCurrentSnapshot = isChronologicallyLater || latestGeneratedAt === null;
        const newlyDetectedReoccurrence = isPreviouslyClosed && !recurrenceUnreviewed;
        const verificationSuperseded = newlyDetectedReoccurrence && prior.remediationVerification?.status === "verified"
          ? supersedeRemediationVerification(prior, at, "The finding reappeared in a later release bundle; the earlier effectiveness verification is historical and no longer current.")
          : { verificationRuns: prior.verificationRuns, remediationVerification: prior.remediationVerification };
        const updated = {
          ...prior,
          code,
          severity: appliesCurrentSnapshot ? currentSnapshot.severity : prior.severity,
          title: appliesCurrentSnapshot ? currentSnapshot.title : prior.title,
          detail: appliesCurrentSnapshot ? currentSnapshot.detail : prior.detail,
          sourceBundleNames: sources,
          sourceBundleObservations: [...prior.sourceBundleObservations, findingObservation].slice(-20),
          reoccurrence,
          ...verificationSuperseded,
          updatedAt: at,
          auditTrail: [...prior.auditTrail,
            makeEvent(newlyDetectedReoccurrence ? "reoccurrence-detected" : !isChronologicallyLater ? "historical-observation-imported" : "reobserved", message, at),
            ...(newlyDetectedReoccurrence && prior.remediationVerification?.status === "verified" ? [makeEvent("remediation-verification-superseded", "A later release bundle showed the finding again; prior remediation verification is retained as historical evidence, not current proof.", at)] : []),
            ...(changedSnapshotFields.length && appliesCurrentSnapshot ? [makeEvent("finding-details-changed", snapshotMessage, at)] : []),
          ].slice(-MAX_FINDING_AUDIT_EVENTS),
        };
        const index = next.findIndex((finding) => finding.id === prior.id);
        if (index >= 0) next[index] = updated;
        byId.set(prior.id, updated);
      }
      continue;
    }
    if (next.length >= MAX_TRACKED_FINDINGS) {
      throw new RangeError(`This decision record already tracks ${MAX_TRACKED_FINDINGS} findings. Create a new decision record before importing additional findings.`);
    }
    const finding = {
      id,
      code: boundedText(raw.code || "unclassified", 100),
      severity: normalizedSeverity(raw.severity),
      title: boundedText(raw.title || "Untitled review finding", 240),
      detail: boundedText(raw.detail, 1200),
      status: "open",
      owner: "",
      rationale: "",
      evidence: "",
      sourceBundleNames: [normalizedSource],
      sourceBundleObservations: [findingObservation],
      reoccurrence: null,
      verificationRuns: [],
      remediationVerification: { status: "not-verified", runId: "", verifiedAt: null, verifiedBy: "", rationale: "", supersededAt: null, supersededReason: "" },
      freshEvidenceRequired: false,
      previousEvidence: "",
      freshEvidenceRequestedAt: null,
      freshEvidenceAt: null,
      createdAt: at,
      updatedAt: at,
      resolvedAt: null,
      auditTrail: [makeEvent("imported", `Imported from ${normalizedSource}; status set to Open.`, at)],
    };
    next.push(finding);
    byId.set(id, finding);
    added += 1;
  }
  return { findings: next, added, reobserved, reoccurrencesDetected, total: next.length };
}

/** Explicit reviewer action: reopen a finding after a later bundle shows it reappeared. */
export function reopenTrackedReviewFinding(existingValue, findingId, { updatedAt = new Date().toISOString() } = {}) {
  const findings = normalizeDecisionReviewFindings(existingValue);
  const index = findings.findIndex((finding) => finding.id === findingId);
  if (index < 0) throw new Error(`Review finding not found: ${findingId}.`);
  const current = findings[index];
  if (current.status === "open") throw new Error("This finding is already Open.");
  if (current.reoccurrence?.state !== "unreviewed") throw new Error("This finding has no unreviewed reoccurrence to reopen.");
  const at = safeDate(updatedAt);
  const source = current.reoccurrence.sourceBundleName || "the newly imported release bundle";
  const invalidated = current.remediationVerification?.status === "verified"
    ? supersedeRemediationVerification(current, at, "The finding was reopened after reoccurrence; prior verification is retained as historical evidence.")
    : { verificationRuns: current.verificationRuns, remediationVerification: current.remediationVerification };
  const events = [
    makeEvent("reoccurrence-reopened", `Reviewer reopened the finding after it reappeared in ${source}; previous disposition was ${current.status}.`, at),
    makeEvent("status-changed", `Status changed from ${current.status} to open after a recurring finding was confirmed.`, at),
    ...(current.remediationVerification?.status === "verified" ? [makeEvent("remediation-verification-superseded", "Prior remediation verification is no longer current after reoccurrence.", at)] : []),
  ];
  const next = {
    ...current,
    ...invalidated,
    status: "open",
    resolvedAt: null,
    previousEvidence: current.evidence,
    evidence: "",
    freshEvidenceRequired: true,
    freshEvidenceRequestedAt: at,
    freshEvidenceAt: null,
    reoccurrence: { ...current.reoccurrence, state: "reopened", reviewedAt: at },
    updatedAt: at,
    auditTrail: [...current.auditTrail, makeEvent("fresh-evidence-requested", "Fresh supporting evidence is required before this reopened finding can be marked Resolved or Accepted Risk again.", at), ...events].slice(-MAX_FINDING_AUDIT_EVENTS),
  };
  findings[index] = next;
  return { findings, finding: next, events };
}

/** Update one tracked finding. Accepted risk and resolved states require accountable, documented evidence. */
export function updateTrackedReviewFinding(existingValue, findingId, patch, { updatedAt = new Date().toISOString() } = {}) {
  if (!isRecord(patch)) throw new TypeError("Finding updates must be an object.");
  const findings = normalizeDecisionReviewFindings(existingValue);
  const index = findings.findIndex((finding) => finding.id === findingId);
  if (index < 0) throw new Error(`Review finding not found: ${findingId}.`);
  const current = findings[index];
  const at = safeDate(updatedAt);
  const next = { ...current };
  const events = [];
  const setField = (key, maxLength, eventType, messageFor) => {
    if (!Object.hasOwn(patch, key)) return;
    const value = boundedText(patch[key], maxLength);
    if (value === next[key]) return;
    next[key] = value;
    events.push(makeEvent(eventType, messageFor(value), at));
    if (key === "evidence" && current.freshEvidenceRequired && value) {
      if (value === current.previousEvidence) {
        throw new Error("The evidence must be fresh and different from the evidence recorded before reopening.");
      }
      next.freshEvidenceRequired = false;
      next.freshEvidenceAt = at;
      events.push(makeEvent("fresh-evidence-recorded", "Fresh supporting evidence recorded after the finding was reopened.", at));
    }
  };
  setField("owner", 120, "owner-updated", (value) => value ? `Owner assigned to ${value}.` : "Owner cleared.");
  setField("rationale", 1600, "rationale-updated", (value) => value ? "Finding rationale updated." : "Finding rationale cleared.");
  setField("evidence", 1200, "evidence-updated", (value) => value ? "Supporting evidence updated." : "Supporting evidence cleared.");
  if (Object.hasOwn(patch, "acceptanceCriteria")) {
    const criteria = validateRemediationAcceptanceCriteria(patch.acceptanceCriteria);
    if (!acceptanceCriteriaEqual(criteria, current.acceptanceCriteria)) {
      next.acceptanceCriteria = criteria;
      events.push(makeEvent("acceptance-criteria-updated", criteria && Object.keys(criteria).length
        ? `Quantitative acceptance criteria updated: ${Object.keys(criteria).join(", ")}.`
        : "Quantitative acceptance criteria cleared.", at));
      if (current.verificationRuns.length) events.push(makeEvent("verification-reassessment-required", "Acceptance criteria changed; the existing verification run(s) do not establish whether the current targets pass. Record a new run.", at));
      if (current.remediationVerification?.status === "verified") {
        const reason = "Quantitative acceptance criteria changed after verification; a new run and reviewer confirmation are required.";
        const superseded = supersedeRemediationVerification(current, at, reason);
        next.verificationRuns = superseded.verificationRuns;
        next.remediationVerification = superseded.remediationVerification;
        events.push(makeEvent("remediation-verification-superseded", reason, at));
      }
    }
  }

  if (Object.hasOwn(patch, "status")) {
    if (!STATUSES.has(patch.status)) throw new TypeError(`Unsupported finding status: ${String(patch.status)}.`);
    if (patch.status !== current.status) {
      next.status = patch.status;
      events.push(makeEvent("status-changed", `Status changed from ${current.status} to ${patch.status}.`, at));
    }
  }

  if (next.status !== "open") {
    if (next.freshEvidenceRequired) throw new Error("Add fresh supporting evidence different from the evidence recorded before reopening before closing this finding again.");
    const missing = [];
    if (!next.owner) missing.push("owner");
    if (!next.rationale) missing.push("rationale");
    if (!next.evidence) missing.push("supporting evidence");
    if (missing.length) throw new Error(`Add ${missing.join(", ")} before marking this finding ${next.status === "resolved" ? "Resolved" : "Accepted Risk"}.`);
  }

  if (events.length) {
    next.updatedAt = at;
    next.resolvedAt = next.status === "resolved" ? (current.status === "resolved" && current.resolvedAt ? current.resolvedAt : at) : null;
    next.auditTrail = [...current.auditTrail, ...events].slice(-MAX_FINDING_AUDIT_EVENTS);
    findings[index] = next;
  }
  return { findings, events, finding: next };
}

/** Record a reviewer disposition for one current drift item without editing a verification run's historic source snapshot. */
export function recordRemediationSourceDriftResolution(existingValue, findingId, runId, metricKey, side, input, { updatedAt = new Date().toISOString(), loadTestRecords = [] } = {}) {
  if (!isRecord(input)) throw new TypeError("Source drift review details are required.");
  const findings = normalizeDecisionReviewFindings(existingValue);
  const index = findings.findIndex((finding) => finding.id === findingId);
  if (index < 0) throw new Error(`Review finding not found: ${findingId}.`);
  const current = findings[index];
  const run = current.verificationRuns.find((entry) => entry.id === runId);
  if (!run) throw new Error(`Verification run not found: ${runId}.`);
  if (!Array.isArray(loadTestRecords)) throw new Error("Current load-test records are required to review source drift.");
  const drift = evaluateRemediationMeasurementSourceDrift(run.measurementSources, loadTestRecords);
  const item = drift.items.find((entry) => entry.metricKey === metricKey && entry.side === side && entry.state !== "unchanged");
  if (!item) throw new Error("The selected source mapping no longer has a current drift difference. Recheck the latest source state before recording a review.");
  const at = safeDate(updatedAt);
  const review = createRemediationSourceDriftReview(input, item, runId, { reviewedAt: at });
  const sourceDriftReviews = normalizeRemediationSourceDriftReviews([...current.sourceDriftReviews, review]);
  const dispositionMessage = review.disposition === "acceptable-context"
    ? `Reviewer ${review.reviewer} accepted a display-name-only source change as non-material context for run ${runId}. The original verification snapshot remains unchanged. Rationale: ${review.rationale}`
    : `Reviewer ${review.reviewer} marked ${item.metricLabel} ${item.side} source drift (${item.sourceRecordId}) as requiring a new verification run. The original run and source snapshot remain historical and unchanged. Rationale: ${review.rationale}`;
  const event = makeEvent(`source-drift-${review.disposition}`, dispositionMessage, at);
  let verificationRuns = current.verificationRuns;
  let remediationVerification = current.remediationVerification;
  const events = [event];
  if (review.disposition === "requires-reverification" && remediationVerification.status === "verified" && remediationVerification.runId === runId) {
    const reason = `Reviewer ${review.reviewer} determined that current source drift requires a new verification run. The prior passing run and its source snapshot remain historical. Rationale: ${review.rationale}`;
    const superseded = supersedeRemediationVerification({ ...current, verificationRuns }, at, reason);
    verificationRuns = superseded.verificationRuns;
    remediationVerification = superseded.remediationVerification;
    events.push(makeEvent("remediation-verification-superseded", reason, at));
  }
  const next = {
    ...current, sourceDriftReviews, verificationRuns, remediationVerification, updatedAt: at,
    auditTrail: [...current.auditTrail, ...events].slice(-MAX_FINDING_AUDIT_EVENTS),
  };
  findings[index] = next;
  return { findings, finding: next, review, event, events };
}

function supersedeRemediationVerification(finding, at, reason) {
  const verification = finding.remediationVerification || {};
  const runId = verification.runId;
  const runs = safeArray(finding.verificationRuns).map((run) => run.id === runId ? {
    ...run,
    verificationSupersededAt: at,
    verificationSupersededReason: boundedText(reason, 600),
  } : run);
  return {
    verificationRuns: runs,
    remediationVerification: {
      ...verification,
      status: "superseded",
      supersededAt: at,
      supersededReason: boundedText(reason, 600),
    },
  };
}

export const REMEDIATION_VERIFICATION_RUN_TYPE_OPTIONS = Object.freeze([
  { value: "regression-test", label: "Regression test" },
  { value: "load-test", label: "Load test" },
  { value: "monitoring", label: "Monitoring window" },
  { value: "manual-check", label: "Manual verification" },
  { value: "other", label: "Other" },
]);

export const REMEDIATION_VERIFICATION_OUTCOME_OPTIONS = Object.freeze([
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "inconclusive", label: "Inconclusive" },
]);

/** Record a reviewer-supplied verification run without treating its outcome as independent proof. */
export function recordRemediationVerificationRun(existingValue, findingId, input, { updatedAt = new Date().toISOString(), loadTestRecords = [] } = {}) {
  if (!isRecord(input)) throw new TypeError("A verification run must be an object.");
  const findings = normalizeDecisionReviewFindings(existingValue);
  const index = findings.findIndex((finding) => finding.id === findingId);
  if (index < 0) throw new Error(`Review finding not found: ${findingId}.`);
  const current = findings[index];
  const at = safeDate(updatedAt);
  const runType = boundedText(input.runType, 40);
  const outcome = boundedText(input.outcome, 20);
  const beforeState = boundedText(input.beforeState, 1000);
  const afterState = boundedText(input.afterState, 1000);
  const summary = boundedText(input.summary, 1600);
  const evidence = boundedText(input.evidence, 1200);
  const recordedBy = boundedText(input.recordedBy, 120);
  const measurements = validateRemediationMeasurements(input.measurements || {});
  const capturedSources = captureRemediationMeasurementSources(input.measurementSources || {}, measurements, loadTestRecords);
  const measurementSources = capturedSources.sources;
  const measurementSourceEvaluation = summarizeRemediationMeasurementSourceEvaluation(capturedSources.evaluation);
  const acceptanceCriteriaSnapshot = normalizeRemediationAcceptanceCriteria(current.acceptanceCriteria);
  const acceptanceEvaluation = evaluateRemediationAcceptanceCriteria(acceptanceCriteriaSnapshot, measurements);
  const missing = [];
  if (!VERIFICATION_RUN_TYPES.has(runType)) missing.push("a recognized verification method");
  if (!VERIFICATION_OUTCOMES.has(outcome)) missing.push("a Pass, Fail, or Inconclusive outcome");
  if (!beforeState) missing.push("the before-remediation state");
  if (!afterState) missing.push("the after-remediation result");
  if (!summary) missing.push("a verification summary");
  if (!evidence) missing.push("a distinct supporting evidence reference");
  if (!recordedBy) missing.push("the person recording the run");
  if (missing.length) throw new Error(`Complete ${missing.join(", ")} before recording the verification run.`);
  if (current.freshEvidenceRequired && evidence === current.previousEvidence) {
    throw new Error("The verification run must cite fresh evidence different from the reference recorded before reopening.");
  }
  if (current.freshEvidenceRequired && current.freshEvidenceRequestedAt && Date.parse(at) < Date.parse(current.freshEvidenceRequestedAt)) {
    throw new Error("The verification run must be recorded after the finding was reopened.");
  }
  const id = `verification-${stableHash(`${findingId}|${at}|${runType}|${outcome}|${evidence}|${Math.random()}`)}`;
  const run = {
    id, runType, outcome, beforeState, afterState, summary, evidence, recordedBy, recordedAt: at,
    measurements, measurementSources, measurementSourceEvaluation, acceptanceCriteriaSnapshot, acceptanceEvaluation,
    reviewerVerifiedAt: null, reviewerVerifiedBy: "", verificationRationale: "",
    verificationSupersededAt: null, verificationSupersededReason: "",
  };
  let verificationRuns = [...current.verificationRuns, run].slice(-MAX_VERIFICATION_RUNS);
  let remediationVerification = current.remediationVerification;
  const events = [makeEvent("verification-run-recorded", `${REMEDIATION_VERIFICATION_RUN_TYPE_OPTIONS.find((option) => option.value === runType)?.label || "Verification"} run recorded with outcome ${outcome.toUpperCase()}: ${summary}`, at)];
  if (remediationVerification.status === "verified") {
    const reason = outcome === "pass"
      ? "A newer passing run was recorded; a reviewer must explicitly confirm that run before remediation is considered currently verified."
      : `A newer verification run recorded ${outcome.toUpperCase()}; the prior passing verification is no longer current.`;
    const superseded = supersedeRemediationVerification({ ...current, verificationRuns }, at, reason);
    verificationRuns = superseded.verificationRuns;
    remediationVerification = superseded.remediationVerification;
    events.push(makeEvent("remediation-verification-superseded", reason, at));
  }
  const next = {
    ...current,
    verificationRuns,
    remediationVerification,
    evidence: current.freshEvidenceRequired ? evidence : current.evidence,
    freshEvidenceRequired: current.freshEvidenceRequired ? false : current.freshEvidenceRequired,
    freshEvidenceAt: current.freshEvidenceRequired ? at : current.freshEvidenceAt,
    updatedAt: at,
    auditTrail: [...current.auditTrail,
      ...(current.freshEvidenceRequired ? [makeEvent("fresh-evidence-recorded", "The verification run supplied a new evidence reference after the recurrence.", at)] : []),
      ...events,
    ].slice(-MAX_FINDING_AUDIT_EVENTS),
  };
  findings[index] = next;
  return { findings, finding: next, run, events };
}

/** Explicit human review of a passing run. A recorded Pass alone is not a verified remediation decision. */
export function confirmRemediationVerification(existingValue, findingId, runId, { verifiedBy, rationale, updatedAt = new Date().toISOString(), loadTestRecords } = {}) {
  const findings = normalizeDecisionReviewFindings(existingValue);
  const index = findings.findIndex((finding) => finding.id === findingId);
  if (index < 0) throw new Error(`Review finding not found: ${findingId}.`);
  const current = findings[index];
  const at = safeDate(updatedAt);
  const run = current.verificationRuns.find((entry) => entry.id === runId);
  if (!run) throw new Error("Select a recorded verification run before confirming remediation.");
  const latestRun = current.verificationRuns.at(-1);
  if (latestRun?.id !== run.id) throw new Error("Only the latest verification run can be confirmed; record review of the newest outcome first.");
  if (run.outcome !== "pass") throw new Error("Remediation can only be verified from a passing verification run.");
  if (run.verificationSupersededAt) throw new Error("This verification run has been superseded and cannot verify the current remediation state.");
  const currentCriteria = normalizeRemediationAcceptanceCriteria(current.acceptanceCriteria);
  if (!acceptanceCriteriaEqual(currentCriteria, run.acceptanceCriteriaSnapshot)) {
    throw new Error("Acceptance criteria changed after this run; record a new verification run against the current criteria.");
  }
  if (Object.keys(currentCriteria).length) {
    const evaluation = evaluateRemediationAcceptanceCriteria(currentCriteria, run.measurements);
    if (evaluation.status !== "pass") throw new Error(`Quantitative acceptance criteria are ${evaluation.status}; all configured targets must pass before remediation can be verified.`);
  }
  const sourceEvaluation = evaluateRemediationMeasurementSources(run.measurements, run.measurementSources);
  if (sourceEvaluation.measurementCount > 0 && sourceEvaluation.status !== "complete") {
    throw new Error(`Measurement source mappings are ${sourceEvaluation.status}; link every numeric before/after value to a matching source field and value before confirming remediation.`);
  }
  if (Array.isArray(loadTestRecords)) {
    const driftEvaluation = evaluateRemediationMeasurementSourceDrift(run.measurementSources, loadTestRecords);
    if (!["unchanged", "not-applicable"].includes(driftEvaluation.status)
      && !remediationSourceDriftCanStayVerified(current, run.id, loadTestRecords)) {
      throw new Error(`Measurement source drift is ${driftEvaluation.status}; review changed, missing, or incomplete source snapshots and record a new verification run before confirming remediation. Only a reviewed display-name-only change may be accepted as non-material context.`);
    }
  }
  const reviewer = boundedText(verifiedBy, 120);
  const reviewRationale = boundedText(rationale, 1200);
  if (!reviewer || !reviewRationale) throw new Error("A reviewer and verification rationale are required to confirm remediation.");
  if (current.freshEvidenceRequired) throw new Error("Record fresh supporting evidence after reoccurrence before confirming remediation.");
  if (current.freshEvidenceRequestedAt && (Date.parse(run.recordedAt) < Date.parse(current.freshEvidenceRequestedAt) || run.evidence === current.previousEvidence)) {
    throw new Error("After a recurrence, only a new verification run with fresh evidence recorded after reopening can verify remediation.");
  }
  const nextRun = { ...run, reviewerVerifiedAt: at, reviewerVerifiedBy: reviewer, verificationRationale: reviewRationale, verificationSupersededAt: null, verificationSupersededReason: "" };
  const verificationRuns = current.verificationRuns.map((entry) => entry.id === run.id ? nextRun : entry);
  const remediationVerification = {
    status: "verified", runId: run.id, verifiedAt: at, verifiedBy: reviewer, rationale: reviewRationale,
    supersededAt: null, supersededReason: "",
  };
  const event = makeEvent("remediation-verified", `Reviewer ${reviewer} confirmed remediation from passing run ${run.id}. Rationale: ${reviewRationale}`, at);
  const next = {
    ...current, verificationRuns, remediationVerification, updatedAt: at,
    auditTrail: [...current.auditTrail, event].slice(-MAX_FINDING_AUDIT_EVENTS),
  };
  findings[index] = next;
  return { findings, finding: next, run: nextRun, event };
}

/** Summarize submitted runs separately from a reviewer-confirmed, currently applicable verification. */
export function buildRemediationEffectivenessSummary(findingValue, options = {}) {
  const finding = normalizeDecisionReviewFindings([findingValue])[0];
  if (!finding) return { status: "not-recorded", label: "No verification recorded", runs: [], latestRun: null, isVerified: false, changes: [], acceptanceEvaluation: { status: "not-configured", criteria: [] } };
  const runs = finding.verificationRuns;
  const latestRun = runs.at(-1) || null;
  const priorRun = runs.length > 1 ? runs.at(-2) : null;
  const verification = finding.remediationVerification;
  const configuredCriteria = finding.acceptanceCriteria;
  let acceptanceEvaluation = latestRun
    ? evaluateRemediationAcceptanceCriteria(latestRun.acceptanceCriteriaSnapshot, latestRun.measurements)
    : evaluateRemediationAcceptanceCriteria(configuredCriteria, {});
  const checksCurrentSources = Object.hasOwn(options, "loadTestRecords") && Array.isArray(options.loadTestRecords);
  const measurementSourceEvaluation = latestRun
    ? evaluateRemediationMeasurementSources(latestRun.measurements, latestRun.measurementSources, ...(checksCurrentSources ? [{ loadTestRecords: options.loadTestRecords }] : []))
    : evaluateRemediationMeasurementSources({}, {});
  const sourceDriftEvaluation = latestRun
    ? evaluateRemediationMeasurementSourceDrift(latestRun.measurementSources, checksCurrentSources ? options.loadTestRecords : undefined)
    : evaluateRemediationMeasurementSourceDrift({}, checksCurrentSources ? options.loadTestRecords : undefined);
  const measurementSourcesSatisfied = measurementSourceEvaluation.measurementCount === 0 || measurementSourceEvaluation.status === "complete";
  const sourceDriftSatisfied = !checksCurrentSources || ["unchanged", "not-applicable"].includes(sourceDriftEvaluation.status)
    || remediationSourceDriftCanStayVerified(finding, latestRun?.id, options.loadTestRecords);
  const criteriaMatch = Boolean(latestRun && acceptanceCriteriaEqual(configuredCriteria, latestRun.acceptanceCriteriaSnapshot));
  const criteriaChanged = Boolean(latestRun && !criteriaMatch
    && (Object.keys(configuredCriteria).length || Object.keys(latestRun.acceptanceCriteriaSnapshot || {}).length));
  if (criteriaChanged) {
    const currentCriteriaEvaluation = evaluateRemediationAcceptanceCriteria(configuredCriteria, {});
    acceptanceEvaluation = {
      ...currentCriteriaEvaluation,
      status: "not-evaluated",
      reason: "Acceptance criteria changed after this run. Record a new verification run against the current criteria.",
    };
  }
  const criteriaPass = Boolean(latestRun && !criteriaChanged
    && (!Object.keys(configuredCriteria).length || acceptanceEvaluation.status === "pass"));
  const isVerified = Boolean(verification.status === "verified" && latestRun && verification.runId === latestRun.id
    && latestRun.outcome === "pass" && !latestRun.verificationSupersededAt && latestRun.reviewerVerifiedAt && criteriaPass && measurementSourcesSatisfied && sourceDriftSatisfied);
  let status = "not-recorded";
  if (isVerified) status = "verified";
  else if (latestRun?.outcome === "pass" && acceptanceEvaluation.status === "fail") status = "criteria-failed";
  else if (latestRun?.outcome === "pass" && ["incomplete", "unevaluated"].includes(acceptanceEvaluation.status)) status = "criteria-incomplete";
  else if (latestRun?.outcome === "pass" && acceptanceEvaluation.status === "not-evaluated") status = "criteria-not-evaluated";
  else if (latestRun?.outcome === "pass" && checksCurrentSources && sourceDriftEvaluation.status === "drift-detected") status = "measurement-source-drift-detected";
  else if (latestRun?.outcome === "pass" && checksCurrentSources && sourceDriftEvaluation.status === "snapshot-incomplete") status = "measurement-source-snapshot-incomplete";
  else if (latestRun?.outcome === "pass" && measurementSourceEvaluation.status === "inconsistent") status = "measurement-sources-inconsistent";
  else if (latestRun?.outcome === "pass" && measurementSourceEvaluation.measurementCount > 0 && measurementSourceEvaluation.status !== "complete") status = "measurement-sources-incomplete";
  else if (latestRun?.outcome === "pass" && !latestRun.verificationSupersededAt) status = "awaiting-confirmation";
  else if (latestRun?.outcome === "fail") status = "failed";
  else if (latestRun?.outcome === "inconclusive") status = "inconclusive";
  else if (verification.status === "superseded") status = "superseded";
  const labels = {
    "not-recorded": "No verification run recorded",
    "awaiting-confirmation": "Passing run submitted · reviewer confirmation required",
    verified: "Remediation verified by reviewer",
    failed: "Latest verification run failed",
    inconclusive: "Latest verification result is inconclusive",
    superseded: "Previous verification is historical · re-verification required",
    "criteria-failed": "Quantitative acceptance criteria failed",
    "criteria-incomplete": "Quantitative acceptance criteria need measurements",
    "criteria-not-evaluated": "Run predates current acceptance criteria",
    "measurement-sources-inconsistent": "Measurement source values do not match recorded measurements",
    "measurement-sources-incomplete": "Measurement source mappings are incomplete",
    "measurement-source-drift-detected": "Saved measurement sources have changed",
    "measurement-source-snapshot-incomplete": "Measurement source snapshot is incomplete",
  };
  const previous = latestRun?.beforeState || "";
  const current = latestRun?.afterState || "";
  return {
    status, label: labels[status], runs, latestRun, priorRun, isVerified,
    verification, acceptanceCriteria: configuredCriteria, acceptanceEvaluation, measurementSourceEvaluation, sourceDriftEvaluation,
    sourceDriftResolutionSummary: latestRun ? summarizeRemediationSourceDriftResolution(finding, latestRun.id, checksCurrentSources ? options.loadTestRecords : undefined) : null,
    changes: previous || current ? [{ field: "before / after", previous, current }] : [],
    evidenceSubmitted: runs.length > 0,
  };
}

export function summarizeDecisionReviewFindings(value, options = {}) {
  const findings = normalizeDecisionReviewFindings(value);
  return {
    total: findings.length,
    open: findings.filter((finding) => finding.status === "open").length,
    blocking: findings.filter((finding) => finding.status === "open" && finding.severity === "error").length,
    acceptedRisk: findings.filter((finding) => finding.status === "accepted-risk").length,
    resolved: findings.filter((finding) => finding.status === "resolved").length,
    reoccurrences: findings.filter((finding) => finding.reoccurrence?.state === "unreviewed").length,
    reoccurrenceBlockers: findings.filter((finding) => finding.reoccurrence?.state === "unreviewed" && finding.severity === "error").length,
    freshEvidenceRequired: findings.filter((finding) => finding.freshEvidenceRequired).length,
    remediationVerified: findings.filter((finding) => buildRemediationEffectivenessSummary(finding, options).isVerified).length,
    resolvedButUnverified: findings.filter((finding) => finding.status === "resolved" && !buildRemediationEffectivenessSummary(finding, options).isVerified).length,
    verificationRuns: findings.reduce((total, finding) => total + finding.verificationRuns.length, 0),
    bySeverity: Object.fromEntries(["error", "warning", "info"].map((severity) => [severity, findings.filter((finding) => finding.severity === severity && finding.status === "open").length])),
  };
}


/** Return an import-order timeline and a field-level comparison of its newest two observations. */
export function buildReviewFindingObservationTimeline(findingValue) {
  const finding = normalizeDecisionReviewFindings([findingValue])[0];
  if (!finding) return { timeline: [], previous: null, latest: null, changes: [], hasDetailChanges: false };
  const timeline = finding.sourceBundleObservations.slice().sort((left, right) => {
    const leftTime = Date.parse(left.generatedAt || left.observedAt || finding.createdAt) || 0;
    const rightTime = Date.parse(right.generatedAt || right.observedAt || finding.createdAt) || 0;
    return leftTime - rightTime;
  });
  const latest = timeline.at(-1) || null;
  const previous = timeline.length > 1 ? timeline.at(-2) : null;
  const priorSnapshot = previous?.findingSnapshot;
  const latestSnapshot = latest?.findingSnapshot;
  const fields = ["severity", "title", "detail"];
  const changes = priorSnapshot && latestSnapshot
    ? fields.filter((field) => priorSnapshot[field] !== latestSnapshot[field]).map((field) => ({
      field,
      previous: priorSnapshot[field] ?? "",
      current: latestSnapshot[field] ?? "",
    }))
    : [];
  return { timeline, previous, latest, changes, hasDetailChanges: changes.length > 0 };
}

export const REVIEW_FINDING_STATUS_OPTIONS = Object.freeze([
  { value: "open", label: "Open" },
  { value: "accepted-risk", label: "Accepted Risk" },
  { value: "resolved", label: "Resolved" },
]);
