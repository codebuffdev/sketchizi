import { buildRemediationEffectivenessSummary, normalizeDecisionReviewFindings, summarizeDecisionReviewFindings } from "./reviewFindingTracking.js";

const REQUIRED_ROLLOUT_CHECKS = Object.freeze([
  {
    id: "production-load-test",
    label: "Review a production-like load test against the proposed architecture, workload, and component scope.",
    guidance: "A saved load-test record alone does not prove that its environment and workload match this proposal.",
  },
  {
    id: "service-objectives",
    label: "Agree measurable service objectives and rollout thresholds for latency, throughput, errors, and dropped requests.",
    guidance: "Record the thresholds and the source of truth used by the team.",
  },
  {
    id: "rollback-plan",
    label: "Document and test rollback, recovery, and any required data restoration steps.",
    guidance: "The rollback path should be executable, not only described.",
  },
  {
    id: "observability",
    label: "Verify dashboards, alerts, logs, and traces for the changed components and dependencies.",
    guidance: "Confirm that signals can detect the defined abort thresholds.",
  },
  {
    id: "security-migration",
    label: "Review security, compatibility, data migration, and backfill impact.",
    guidance: "Mark not-applicable decisions in the evidence note with the reviewer and rationale.",
  },
  {
    id: "operations-ownership",
    label: "Confirm the rollout owner, on-call coverage, runbook, and rollout window.",
    guidance: "Ensure the operational owner knows how to pause or reverse the change.",
  },
  {
    id: "post-deploy-verification",
    label: "Define post-deployment health checks, canary duration, and explicit abort thresholds.",
    guidance: "Specify who validates results and what action follows a failed check.",
  },
]);

const safeArray = (value) => Array.isArray(value) ? value : [];
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const boundedText = (value, limit = 600) => String(value ?? "").trim().slice(0, limit);
const validDate = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;

export function createDefaultRolloutChecks() {
  return REQUIRED_ROLLOUT_CHECKS.map(({ id, label }) => ({ id, label, done: false, evidence: "", completedAt: null }));
}

/** Normalize new and legacy decision records to the same required rollout checklist. */
export function normalizeRolloutChecks(value) {
  const byId = new Map(safeArray(value).filter(isRecord).map((check) => [check.id, check]));
  return REQUIRED_ROLLOUT_CHECKS.map(({ id, label }) => {
    const source = byId.get(id) || {};
    const evidence = boundedText(source.evidence, 600);
    const done = source.done === true;
    return {
      id,
      label,
      done,
      evidence,
      completedAt: done && evidence ? validDate(source.completedAt) : null,
    };
  });
}

function item(id, label, complete, detail, { blocked = false, category = "evidence" } = {}) {
  return { id, label, state: complete ? "complete" : (blocked ? "blocked" : "pending"), detail, category };
}

/** Derive rollout readiness; completion means ready for a human rollout review, never automatic release approval. */
export function buildRolloutReadiness(record, options = {}) {
  if (!isRecord(record) || !isRecord(record.reportSnapshot)) {
    return {
      status: "unavailable",
      label: "No decision record selected",
      completeCount: 0,
      totalCount: 0,
      outstandingCount: 1,
      checks: [item("decision-record", "Select a saved decision record", false, "Rollout readiness is derived from a saved decision and its point-in-time evidence.", { blocked: true, category: "decision" })],
      disclaimer: "This checklist never authorizes deployment. Final rollout approval remains a separate human decision.",
    };
  }

  const report = record.reportSnapshot;
  const gates = safeArray(record.validationGates);
  const metrics = safeArray(report.metrics);
  const rolloutChecks = normalizeRolloutChecks(record.rolloutChecks);
  const checks = [];

  checks.push(item(
    "decision-status",
    "Decision explicitly accepted by the review owner",
    record.status === "accepted",
    record.status === "rejected"
      ? "The decision is rejected; do not roll out this proposal. Reopen the design decision before proceeding."
      : record.status === "accepted"
        ? "The record is marked accepted. This is a design decision, not production release approval."
        : `Current decision status is ${boundedText(record.status || "proposed")}; acceptance is required before rollout review.`,
    { blocked: record.status === "rejected", category: "decision" },
  ));

  const ownerAndRationale = Boolean(boundedText(record.owner) && boundedText(record.rationale));
  checks.push(item("decision-accountability", "Record a decision owner and human rationale", ownerAndRationale,
    ownerAndRationale ? `Owner: ${boundedText(record.owner, 120)}.` : "Both an owner and a non-empty rationale are required.", { category: "decision" }));

  const architectureChanged = report.changeStatus === "changed" && Number.isFinite(report.changeCount) && report.changeCount > 0;
  const architectureKnown = report.changeStatus === "changed" || report.changeStatus === "identical";
  checks.push(item("architecture-delta", "Confirm the proposal contains a known semantic architecture change", architectureChanged,
    architectureChanged ? `${report.changeCount} semantic change(s) are captured in the decision snapshot.`
      : report.changeStatus === "identical" ? "The saved report found no semantic architecture change to roll out."
        : "The report does not contain a usable semantic architecture baseline and change count.",
    { blocked: !architectureChanged && (report.changeStatus === "identical" || !architectureKnown), category: "evidence" }));

  const comparableSimulation = report.simulationStatus === "comparable" && metrics.length > 0;
  checks.push(item("simulation-evidence", "Review a like-for-like simulation comparison with reported metrics", comparableSimulation,
    comparableSimulation ? "The saved report contains comparable simulation metrics; these remain synthetic evidence."
      : `Comparable simulation evidence is unavailable or has no metric rows (status: ${boundedText(report.simulationStatus || "unavailable")}). Rerun with matching model, infrastructure profile, and component scope.`,
    { blocked: true, category: "evidence" }));

  checks.push(item("profile-confirmation", "Confirm the infrastructure assumptions used by the simulation", report.profileConfirmed === true,
    report.profileConfirmed === true ? "The report records its modeled profile assumptions as user-confirmed." : "One or more profile assumptions remain unconfirmed in the report snapshot.",
    { blocked: report.profileConfirmed !== true, category: "evidence" }));

  const gatesComplete = gates.length > 0 && gates.every((gate) => gate?.done === true);
  checks.push(item("decision-validation-gates", "Complete all decision-specific validation gates", gatesComplete,
    gates.length === 0 ? "No decision-specific validation gates were recorded; review the report's next steps and capture the required gates."
      : `${gates.filter((gate) => gate?.done !== true).length} of ${gates.length} decision-specific validation gate(s) remain open.`,
    { category: "validation" }));

  const loadTestCount = Number.isSafeInteger(report.loadTestRecordsCount) ? Math.max(0, report.loadTestRecordsCount) : 0;
  checks.push(item("load-test-record-present", "Attach at least one load-test evidence record", loadTestCount > 0,
    loadTestCount > 0 ? `${loadTestCount} load-test record(s) existed when this report snapshot was created; a separate review must confirm they match the proposal.`
      : "No load-test records were attached to the report snapshot.",
    { blocked: loadTestCount === 0, category: "evidence" }));

  for (const check of rolloutChecks) {
    const evidenced = check.done && Boolean(boundedText(check.evidence));
    checks.push(item(
      `production-${check.id}`,
      check.label,
      evidenced,
      evidenced ? `Evidence: ${boundedText(check.evidence)}${check.completedAt ? ` · completed ${check.completedAt}` : ""}`
        : check.done ? "A completion note or evidence reference is required before this check counts as complete."
          : (REQUIRED_ROLLOUT_CHECKS.find((definition) => definition.id === check.id)?.guidance || "Complete this check and record supporting evidence."),
      { blocked: check.done && !boundedText(check.evidence), category: "production-check" },
    ));
  }

  const trackedFindings = normalizeDecisionReviewFindings(record.reviewFindings);
  for (const finding of trackedFindings.filter((entry) => entry.status === "open")) {
    const hardBlock = finding.severity === "error";
    checks.push(item(
      `review-finding-${finding.id}`,
      `${hardBlock ? "Blocking error finding" : "Open review finding"}: ${finding.title}`,
      false,
      `${finding.severity.toUpperCase()} · ${finding.code}: ${finding.detail || "No details recorded."}${finding.owner ? ` Owner: ${finding.owner}.` : " No owner assigned."} Open findings require a recorded disposition before final rollout review.`,
      { blocked: hardBlock, category: "review-finding" },
    ));
  }

  for (const finding of trackedFindings.filter((entry) => entry.status === "resolved")) {
    const effectiveness = buildRemediationEffectivenessSummary(finding, options);
    const hardBlock = finding.severity === "error";
    const runDetail = effectiveness.latestRun
      ? `Latest run outcome: ${effectiveness.latestRun.outcome.toUpperCase()} (${effectiveness.latestRun.runType}) recorded ${effectiveness.latestRun.recordedAt}. Evidence submitted: ${effectiveness.latestRun.evidence || "none"}.`
      : "No verification run has been recorded.";
    checks.push(item(
      `review-finding-remediation-verification-${finding.id}`,
      `${effectiveness.isVerified ? "Remediation effectiveness verified" : "Resolved finding lacks current effectiveness verification"}: ${finding.title}`,
      effectiveness.isVerified,
      effectiveness.isVerified
        ? `A reviewer confirmed passing run ${effectiveness.verification.runId} on ${effectiveness.verification.verifiedAt}. Reviewer: ${effectiveness.verification.verifiedBy}. This is a recorded attestation; the bundle does not independently authenticate the run or evidence.`
        : `${runDetail} A Resolved disposition and evidence reference are reviewer records, not proof that remediation worked. Record a before/after verification run, obtain a Pass, and explicitly confirm it as a reviewer.${Object.keys(finding.acceptanceCriteria || {}).length ? ` Quantitative acceptance evaluation: ${effectiveness.acceptanceEvaluation.status} — ${effectiveness.acceptanceEvaluation.reason}` : ""}${["drift-detected", "snapshot-incomplete"].includes(effectiveness.sourceDriftEvaluation?.status) ? ` Current load-test source drift: ${effectiveness.sourceDriftEvaluation.reason}` : ""}${effectiveness.verification?.status === "superseded" ? ` Previous verification is historical: ${effectiveness.verification.supersededReason || "the finding changed after verification"}` : ""}`,
      { blocked: !effectiveness.isVerified && hardBlock, category: "review-finding" },
    ));
  }

  for (const finding of trackedFindings.filter((entry) => entry.status !== "open" && entry.reoccurrence?.state === "unreviewed")) {
    const hardBlock = finding.severity === "error";
    checks.push(item(
      `review-finding-reoccurrence-${finding.id}`,
      `${hardBlock ? "Recurring error blocks rollout" : "Recurring finding needs review"}: ${finding.title}`,
      false,
      `${finding.severity.toUpperCase()} · previously ${finding.reoccurrence.previousStatus}. The finding reappeared in ${finding.reoccurrence.sourceBundleName || "a later release bundle"} on ${finding.reoccurrence.detectedAt}. Its saved disposition is preserved until a reviewer explicitly reopens it.`,
      { blocked: hardBlock, category: "review-finding" },
    ));
  }

  for (const finding of trackedFindings.filter((entry) => entry.freshEvidenceRequired)) {
    const hardBlock = finding.severity === "error";
    checks.push(item(
      `review-finding-fresh-evidence-${finding.id}`,
      `Fresh evidence required after recurrence: ${finding.title}`,
      false,
      `The finding was reopened on ${finding.freshEvidenceRequestedAt || "an unknown date"}. Add new supporting evidence from after the recurrence before marking it Resolved or Accepted Risk.${finding.previousEvidence ? " Earlier evidence is retained as historical context only." : ""}`,
      { blocked: hardBlock, category: "review-finding" },
    ));
  }

  const findingSummary = summarizeDecisionReviewFindings(trackedFindings);
  if (findingSummary.acceptedRisk > 0 || findingSummary.resolved > 0) {
    checks.push(item(
      "review-finding-dispositions",
      "Documented accepted risks and resolved review findings",
      trackedFindings.filter((entry) => entry.status !== "open").every((finding) => finding.owner && finding.rationale && finding.evidence),
      `${findingSummary.acceptedRisk} accepted risk(s), ${findingSummary.resolved} resolved finding(s). Each non-open finding must retain its owner, rationale, and supporting evidence.`,
      { blocked: trackedFindings.filter((entry) => entry.status !== "open").some((finding) => !finding.owner || !finding.rationale || !finding.evidence), category: "review-finding" },
    ));
  }

  const completeCount = checks.filter((check) => check.state === "complete").length;
  const outstanding = checks.filter((check) => check.state !== "complete");
  const rejected = record.status === "rejected";
  const hardBlocked = rejected || outstanding.some((check) => check.state === "blocked");
  const allComplete = outstanding.length === 0;
  let status = "not-ready";
  let label = `${outstanding.length} required item(s) remain before rollout review`;
  if (rejected) {
    status = "blocked";
    label = "Blocked — the architecture decision is rejected";
  } else if (allComplete) {
    status = "review-required";
    label = "Checklist complete — final rollout approval is still required";
  } else if (hardBlocked) {
    status = "blocked";
    label = `${outstanding.length} blocked or incomplete item(s) remain`;
  }

  return {
    status,
    label,
    completeCount,
    totalCount: checks.length,
    outstandingCount: outstanding.length,
    checks,
    disclaimer: "A completed checklist means ready for a human rollout review only. It does not authorize deployment or prove production safety; the release owner must separately approve the rollout and rollback plan.",
  };
}

export const ROLLOUT_CHECK_STATUS_LABELS = Object.freeze({ complete: "Complete", pending: "Pending", blocked: "Blocked" });
