import { buildRolloutReadiness, normalizeRolloutChecks } from "./rolloutReadiness.js";
import { buildRemediationEffectivenessSummary, normalizeDecisionReviewFindings } from "./reviewFindingTracking.js";
import { evaluateRemediationMeasurementSourceDrift } from "./remediationEvidenceMapping.js";
import { remediationSourceDriftCanStayVerified } from "./remediationSourceDriftResolution.js";
import { buildRemediationWorkQueue } from "./remediationWorkQueue.js";
import { normalizeRemediationWorkQueueTasks } from "./remediationWorkQueueMetadata.js";
import { normalizeRemediationHandoffNotes } from "./remediationHandoff.js";

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const safeArray = (value) => Array.isArray(value) ? value : [];
const text = (value, limit = 600) => String(value ?? "").trim().slice(0, limit);
const finite = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
const validDate = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : null;
const DEFAULT_NOTES = Object.freeze([
  "Simulation results are synthetic, assumption-driven outputs and are not production measurements or guarantees.",
  "Load-test metadata and measurements are user-supplied and are not independently authenticated by this bundle.",
  "Metric source mappings preserve record identifiers, field paths, and reported numeric values for traceability. A matching mapping is not proof that the referenced source is authentic or controlled.",
  "A checklist completion and its evidence reference are recorded attestations; this export does not open or verify external tickets, test runs, dashboards, or runbooks.",
  "Final rollout approval is a separate human decision. This bundle never authorizes deployment.",
]);

function normalizeLoadTestRecord(record) {
  const source = isRecord(record) ? record : {};
  const workload = isRecord(source.workload) ? source.workload : {};
  const observed = isRecord(source.observed) ? source.observed : {};
  const measurementKeys = [
    "throughputRps", "p95LatencyMs", "errorRatePercent", "appCpuPercent", "appMemoryGb",
    "dbCpuPercent", "dbConnections", "dbP95QueryMs", "restExclusiveMeanServiceMs",
    "restServiceSampleCount", "dbMeanQueryServiceMs", "dbServiceSampleCount",
  ];
  return {
    id: text(source.id, 120),
    name: text(source.name || source.label || "Unnamed load-test record", 160),
    testedAt: text(source.testedAt, 40),
    targetEnvironment: text(source.targetEnvironment, 200),
    source: text(source.source, 160),
    workload: {
      durationSeconds: finite(workload.durationSeconds),
      offeredRps: finite(workload.offeredRps),
      concurrency: finite(workload.concurrency),
    },
    observed: Object.fromEntries(measurementKeys.map((key) => [key, finite(observed[key])])),
    notes: text(source.notes, 2000),
    evidenceClassification: "user-supplied-measurement",
    independentlyVerified: false,
    verificationNote: "Imported or entered by a user; verify the source system, environment, workload, and metric definitions separately.",
  };
}

function normalizeValidationGate(gate, index) {
  const source = isRecord(gate) ? gate : {};
  const done = source.done === true;
  return {
    id: text(source.id || `gate-${index + 1}`, 100),
    label: text(source.label || `Validation gate ${index + 1}`, 400),
    state: done ? "recorded-complete" : "outstanding",
    done,
    completedAt: done ? validDate(source.completedAt) : null,
    evidenceClassification: "manual-attestation",
    independentlyVerified: false,
  };
}

/** Build a portable, self-contained evidence package from a saved decision and available load-test records. */
export function buildReleaseEvidenceBundle({ record, loadTestRecords = [], generatedAt = new Date().toISOString() } = {}) {
  if (!isRecord(record) || !text(record.id, 120) || !isRecord(record.reportSnapshot)) {
    throw new TypeError("A saved architecture decision record with a report snapshot is required to build a release evidence bundle.");
  }
  const report = record.reportSnapshot;
  const readiness = buildRolloutReadiness(record, { loadTestRecords });
  const remediationQueue = buildRemediationWorkQueue([record], { loadTestRecords, now: generatedAt });
  const activeOverdueTasks = remediationQueue.items.filter((task) => task.isOverdue);
  const checks = safeArray(readiness.checks).map((check) => ({
    id: text(check.id, 120),
    label: text(check.label, 400),
    state: text(check.state, 40),
    category: text(check.category, 60),
    detail: text(check.detail, 1000),
    evidenceClassification: check.category === "production-check"
      ? "manual-attestation"
      : check.category === "decision"
        ? "record-state-assessment"
        : "machine-derived-assessment",
    independentlyVerified: false,
  }));
  const gates = safeArray(record.validationGates).slice(0, 20).map(normalizeValidationGate).filter((gate) => gate.label);
  const rolloutCheckInputs = normalizeRolloutChecks(record.rolloutChecks);
  const readinessById = new Map(checks.map((check) => [check.id, check]));
  const rolloutChecks = rolloutCheckInputs.map((check) => {
    const assessment = readinessById.get(`production-${check.id}`);
    return {
      id: check.id,
      label: check.label,
      checkedByRecordOwner: check.done,
      evidenceReference: text(check.evidence, 600),
      completedAt: validDate(check.completedAt),
      state: assessment?.state || "pending",
      evidenceClassification: "manual-attestation",
      evidenceReferenceVerified: false,
      note: "The status and reference are preserved as recorded; this export does not access the referenced system.",
    };
  });
  const currentLoadTestRecordCount = safeArray(loadTestRecords).length;
  const safeLoadTests = safeArray(loadTestRecords).slice(0, 25).map(normalizeLoadTestRecord);
  const reportedLoadTestCount = Number.isSafeInteger(report.loadTestRecordsCount) ? Math.max(0, report.loadTestRecordsCount) : 0;
  const loadTestCountMatches = reportedLoadTestCount === currentLoadTestRecordCount;
  const reportedRisks = safeArray(report.risks).slice(0, 20).map((risk) => text(risk, 600)).filter(Boolean);
  const limitations = safeArray(report.limitations).slice(0, 12).map((limitation) => text(limitation, 600)).filter(Boolean);
  const unresolvedChecks = checks.filter((check) => check.state !== "complete");
  const openGates = gates.filter((gate) => !gate.done);
  const incompleteRolloutChecks = rolloutChecks.filter((check) => check.state !== "complete");
  const additionalRisks = [];
  if (!loadTestCountMatches) {
    additionalRisks.push(`The saved report snapshot counted ${reportedLoadTestCount} load-test record${reportedLoadTestCount === 1 ? "" : "s"}, while ${currentLoadTestRecordCount} record${currentLoadTestRecordCount === 1 ? " is" : "s are"} present in the profile at export. The bundle cannot infer which records were used for the original report.`);
  }
  if (report.simulationStatus !== "comparable" || !safeArray(report.metrics).length) {
    additionalRisks.push("A like-for-like simulation comparison with metric rows is unavailable in the saved decision snapshot.");
  }
  if (unresolvedChecks.length) additionalRisks.push(`${unresolvedChecks.length} derived readiness check(s) remain incomplete or blocked.`);
  if (openGates.length) additionalRisks.push(`${openGates.length} decision-specific validation gate(s) remain open.`);
  if (incompleteRolloutChecks.length) additionalRisks.push(`${incompleteRolloutChecks.length} production rollout check(s) remain incomplete or lack acceptable recorded evidence.`);
  const trackedFindings = normalizeDecisionReviewFindings(record.reviewFindings);
  const openFindingCount = trackedFindings.filter((finding) => finding.status === "open").length;
  const blockingFindingCount = trackedFindings.filter((finding) => finding.status === "open" && finding.severity === "error").length;
  if (openFindingCount) additionalRisks.push(`${openFindingCount} tracked release review finding(s) remain open, including ${blockingFindingCount} open error-severity finding(s) that block rollout readiness.`);
  if (remediationQueue.overdueCount) additionalRisks.push(`${remediationQueue.overdueCount} active remediation work queue task(s) are overdue and require follow-up: ${activeOverdueTasks.slice(0, 10).map((task) => `${task.kindLabel} (${task.dueDate})`).join(", ") || "details are summarized in the work queue"}.`);
  if (remediationQueue.escalationSummary.overdueBlockerCount) {
    const escalation = remediationQueue.escalationSummary;
    additionalRisks.push(`${escalation.overdueBlockerCount} overdue rollout-blocking remediation task(s) require escalation across ${escalation.affectedDecisionRecordCount} decision record(s); ${escalation.unassignedOverdueBlockerCount} have no task-level assignee${escalation.oldestDueDate ? `, oldest due ${escalation.oldestDueDate} (${escalation.oldestDaysOverdue} day(s) overdue)` : ""}.`);
  }
  const unassignedActiveTaskCount = remediationQueue.unassignedCount;
  if (unassignedActiveTaskCount) additionalRisks.push(`${unassignedActiveTaskCount} active remediation work queue task(s) have no task-level assignee. Task assignment is separate from finding ownership.`);
  if (remediationQueue.resolvedOpenBlockerCount) additionalRisks.push(`${remediationQueue.resolvedOpenBlockerCount} queue task(s) have been marked resolved while the underlying error finding remains open. Queue-task completion does not clear the canonical finding or its rollout blocker.`);
  const resolvedTasksWithOpenFindings = remediationQueue.handoffSummary?.resolvedTasksWithOpenFindings?.count || 0;
  if (resolvedTasksWithOpenFindings > remediationQueue.resolvedOpenBlockerCount) additionalRisks.push(`${resolvedTasksWithOpenFindings - remediationQueue.resolvedOpenBlockerCount} additional resolved queue task(s) have underlying open findings that still require disposition review, even when they are not error-severity rollout blockers.`);
  const resolvedWithoutVerification = trackedFindings.filter((finding) => finding.status === "resolved" && !buildRemediationEffectivenessSummary(finding, { loadTestRecords }).isVerified);
  if (resolvedWithoutVerification.length) additionalRisks.push(`${resolvedWithoutVerification.length} finding(s) are marked Resolved but do not have a current reviewer-confirmed passing effectiveness verification; submitted references alone are not treated as proof of remediation.`);
  const untraceableMeasurementRuns = trackedFindings.flatMap((finding) => finding.verificationRuns.map((run) => ({ finding, run }))
    .filter(({ run }) => run.measurementSourceEvaluation?.measurementCount > 0 && run.measurementSourceEvaluation.status !== "complete"));
  const sourceDriftedRuns = trackedFindings.flatMap((finding) => finding.verificationRuns.map((run) => ({ finding, run }))
    .map(({ finding, run }) => ({ finding, run, drift: evaluateRemediationMeasurementSourceDrift(run.measurementSources, loadTestRecords) }))
    .filter(({ finding, run, drift }) => ["drift-detected", "snapshot-incomplete"].includes(drift.status)
      && !remediationSourceDriftCanStayVerified(finding, run.id, loadTestRecords)));
  if (sourceDriftedRuns.length) additionalRisks.push(`${sourceDriftedRuns.length} remediation verification run(s) have changed, missing, or incomplete load-test source snapshots. Review current attached records and record a new verification run before relying on prior confirmation.`);
  if (untraceableMeasurementRuns.length) additionalRisks.push(`${untraceableMeasurementRuns.length} remediation verification run(s) contain numeric measurements whose source mappings are incomplete or inconsistent. Link each before/after value to a matching load-test record field, report field, or evidence reference before relying on its acceptance result.`);
  const freshEvidenceRequired = trackedFindings.filter((finding) => finding.freshEvidenceRequired);
  if (freshEvidenceRequired.length) additionalRisks.push(`${freshEvidenceRequired.length} reopened finding(s) still require fresh supporting evidence before they can be marked Resolved or Accepted Risk.`);
  const unreviewedReoccurrences = trackedFindings.filter((finding) => finding.reoccurrence?.state === "unreviewed");
  const recurringErrorBlockers = unreviewedReoccurrences.filter((finding) => finding.severity === "error").length;
  if (unreviewedReoccurrences.length) additionalRisks.push(`${unreviewedReoccurrences.length} previously closed finding(s) reappeared in later release bundle(s) and still need reviewer action; ${recurringErrorBlockers} recurring error-severity finding(s) block rollout readiness until explicitly reopened.`);
  if (readiness.status === "review-required") additionalRisks.push("Readiness checks are complete, but final human rollout approval is still required.");

  const decisionRecord = {
    id: text(record.id, 120),
    title: text(record.title || "Architecture decision record", 180),
    status: text(record.status || "proposed", 40),
    owner: text(record.owner, 120),
    rationale: text(record.rationale, 2000),
    baselineName: text(record.baselineName || report.baselineName || "Unavailable", 160),
    proposedName: text(record.proposedName || report.proposedName || "Unavailable", 160),
    createdAt: validDate(record.createdAt),
    updatedAt: validDate(record.updatedAt),
    reportSnapshot: structuredClone(report),
    workQueueTasks: normalizeRemediationWorkQueueTasks(record.workQueueTasks).map((task) => ({
      ...task,
      auditTrail: task.auditTrail.slice(-30).map((event) => ({ ...event, independentlyVerified: false })),
      taskMetadataClassification: "manual-task-planning-metadata",
      independentlyVerified: false,
    })),
    handoffNotes: normalizeRemediationHandoffNotes(record.handoffNotes).map((entry) => ({ ...entry, independentlyVerified: false })),
    reviewFindings: normalizeDecisionReviewFindings(record.reviewFindings).map((finding) => ({
      ...finding,
      sourceBundleNames: finding.sourceBundleNames.slice(0, 10),
      auditTrail: finding.auditTrail.slice(-25).map((event) => ({
        id: text(event.id, 120), type: text(event.type, 60), message: text(event.message, 400), at: validDate(event.at),
      })),
      evidenceClassification: finding.status === "accepted-risk" ? "manual-risk-acceptance"
        : finding.status === "resolved" ? "manual-remediation-attestation" : "reviewer-tracked-finding",
      remediationVerificationClassification: buildRemediationEffectivenessSummary(finding, { loadTestRecords }).isVerified ? "manual-effectiveness-review" : "not-currently-verified",
      independentlyVerified: false,
    })),
    auditTrail: safeArray(record.auditTrail).slice(-50).map((event) => ({
      id: text(event?.id, 120),
      type: text(event?.type, 80),
      message: text(event?.message, 300),
      at: validDate(event?.at),
    })),
  };

  return {
    bundleType: "sketchizi.workbench.release-evidence-bundle",
    schemaVersion: 1,
    generatedAt: validDate(generatedAt) || new Date().toISOString(),
    exportPurpose: "Engineering review of a proposed architecture rollout",
    disposition: readiness.status === "review-required" ? "ready-for-human-review" : readiness.status === "blocked" ? "blocked" : "not-ready-for-human-review",
    decisionRecord,
    readiness: {
      status: readiness.status,
      label: readiness.label,
      completeCount: readiness.completeCount,
      totalCount: readiness.totalCount,
      outstandingCount: readiness.outstandingCount,
      checks,
      disclaimer: readiness.disclaimer,
    },
    remediationWorkQueue: {
      asOfDate: remediationQueue.evaluatedDate,
      taskCount: remediationQueue.totalCount,
      displayedTaskCount: remediationQueue.items.length,
      truncated: remediationQueue.truncated,
      resolvedTaskCount: remediationQueue.totalResolvedCount,
      displayedResolvedTaskCount: remediationQueue.resolvedItems.length,
      resolvedTasksTruncated: remediationQueue.resolvedItemsTruncated,
      resolvedOpenBlockerCount: remediationQueue.resolvedOpenBlockerCount,
      blockingTaskCount: remediationQueue.blockingCount,
      overdueCount: remediationQueue.overdueCount,
      unassignedCount: unassignedActiveTaskCount,
      overdueBlockingCount: remediationQueue.overdueBlockingCount,
      unacknowledgedEscalationCount: remediationQueue.unacknowledgedOverdueBlockingCount,
      assigneeSummary: {
        totalAssigneeCount: remediationQueue.totalAssigneeCount,
        truncated: remediationQueue.assigneeWorkloadsTruncated,
        groups: remediationQueue.assigneeWorkloads,
        scope: "all-derived-tasks-for-exported-record",
      },
      upcomingDeadlineSummary: {
        windowDays: remediationQueue.upcomingDeadlineWindowDays,
        throughDate: remediationQueue.upcomingDeadlineThrough,
        totalCount: remediationQueue.upcomingDeadlineCount,
        displayedCount: remediationQueue.upcomingDeadlines.length,
        truncated: remediationQueue.upcomingDeadlinesTruncated,
        taskIds: remediationQueue.upcomingDeadlines.map((task) => task.id),
        previews: remediationQueue.upcomingDeadlines.map((task) => ({
          id: task.id, kind: task.kind, kindLabel: task.kindLabel, recordId: task.recordId,
          recordTitle: task.recordTitle, findingId: task.findingId, findingTitle: task.findingTitle,
          severity: task.severity, taskAssignee: task.assignee || "", dueDate: task.dueDate,
          dueState: task.dueState, priority: task.priority, blocksRollout: task.blocksRollout,
        })),
      },
      overdueBlockerEscalation: {
        overdueBlockerCount: remediationQueue.escalationSummary.overdueBlockerCount,
        acknowledgedCount: remediationQueue.escalationSummary.acknowledgedCount,
        unacknowledgedCount: remediationQueue.escalationSummary.unacknowledgedCount,
        unassignedCount: remediationQueue.escalationSummary.unassignedOverdueBlockerCount,
        affectedDecisionRecordCount: remediationQueue.escalationSummary.affectedDecisionRecordCount,
        oldestDueDate: remediationQueue.escalationSummary.oldestDueDate || null,
        oldestDaysOverdue: remediationQueue.escalationSummary.oldestDaysOverdue,
        byAssignee: remediationQueue.escalationSummary.byAssignee,
        truncated: remediationQueue.escalationSummary.truncated,
        taskIds: remediationQueue.escalationSummary.items.map((task) => task.id),
        previews: remediationQueue.escalationSummary.items.map((task) => ({
          id: task.id, kind: task.kind, kindLabel: task.kindLabel, recordId: task.recordId,
          recordTitle: task.recordTitle, findingId: task.findingId, findingTitle: task.findingTitle,
          severity: task.severity, taskAssignee: task.assignee || "", dueDate: task.dueDate,
          daysOverdue: task.daysOverdue, priority: task.priority, blocksRollout: task.blocksRollout,
          isEscalationAcknowledged: task.isEscalationAcknowledged,
          escalationAcknowledgement: task.escalationAcknowledgement,
        })),
      },
      handoffSummary: remediationQueue.handoffSummary,
      tasks: remediationQueue.items.map((task) => ({
        id: task.id,
        kind: task.kind,
        kindLabel: task.kindLabel,
        priority: task.priority,
        priorityRank: task.priorityRank,
        blocksRollout: task.blocksRollout,
        recordId: task.recordId,
        recordTitle: task.recordTitle,
        findingId: task.findingId,
        findingCode: task.findingCode,
        findingTitle: task.findingTitle,
        findingSeverity: task.severity,
        findingStatus: task.findingStatus,
        taskAssignee: task.assignee || "",
        findingOwner: task.owner || "",
        dueDate: task.dueDate || null,
        dueState: task.dueState,
        isOverdue: task.isOverdue,
        daysOverdue: task.daysOverdue,
        isUpcomingDeadline: task.isUpcomingDeadline,
        taskMetadataUpdatedAt: task.taskMetadataUpdatedAt || null,
        taskAuditTrail: task.taskAuditTrail.slice(-30),
        lifecycleFingerprint: task.lifecycleFingerprint,
        escalationFingerprint: task.escalationFingerprint,
        isEscalationCandidate: task.isEscalationCandidate,
        isEscalationAcknowledged: task.isEscalationAcknowledged,
        isEscalationAcknowledgementStale: task.isEscalationAcknowledgementStale,
        escalationAcknowledgement: task.escalationAcknowledgement,
        taskResolutionStatus: task.taskResolution?.status || "open",
        taskResolutionStale: task.taskResolutionStale,
        taskResolution: task.taskResolution,
        resolutionHistory: task.resolutionHistory.slice(-10),
        followUpNotes: task.followUpNotes.slice(-30),
        reason: task.reason,
        evidenceClassification: "derived-task-with-manual-planning-metadata",
        independentlyVerified: false,
      })),
      resolvedTasks: remediationQueue.resolvedItems.map((task) => ({
        id: task.id, kind: task.kind, kindLabel: task.kindLabel, priority: task.priority, priorityRank: task.priorityRank,
        blocksRollout: task.blocksRollout, recordId: task.recordId, recordTitle: task.recordTitle,
        findingId: task.findingId, findingCode: task.findingCode, findingTitle: task.findingTitle,
        findingSeverity: task.severity, findingStatus: task.findingStatus, taskAssignee: task.assignee || "",
        findingOwner: task.owner || "", dueDate: task.dueDate || null, dueState: task.dueState,
        isOverdue: task.isOverdue, daysOverdue: task.daysOverdue, lifecycleFingerprint: task.lifecycleFingerprint,
        taskResolutionStatus: task.taskResolution?.status || "resolved", taskResolutionStale: task.taskResolutionStale,
        taskResolution: task.taskResolution, resolutionHistory: task.resolutionHistory.slice(-10),
        followUpNotes: task.followUpNotes.slice(-30), taskAuditTrail: task.taskAuditTrail.slice(-30),
        evidenceClassification: "manual-task-resolution-metadata", independentlyVerified: false,
      })),
      disclaimer: "Tasks are derived from this saved decision record and current load-test inventory. Escalation acknowledgements and task resolutions are manual workflow metadata, not proof of remediation or rollout approval. Marking a task resolved does not change the underlying finding disposition or evidence snapshot. When the queue is truncated, summaries cover all derived tasks while active/resolved task arrays contain bounded previews.",
    },
    evidenceInventory: {
      architectureChanges: {
        evidenceClassification: "saved-semantic-architecture-snapshot",
        changeStatus: text(report.changeStatus || "unavailable", 40),
        changeCount: Number.isSafeInteger(report.changeCount) ? Math.max(0, report.changeCount) : 0,
        counts: isRecord(report.counts) ? structuredClone(report.counts) : {},
        changes: safeArray(report.changes).slice(0, 30).map((change) => ({
          action: text(change?.action, 40), subjectType: text(change?.subjectType, 40), label: text(change?.label || change?.subjectId, 160), detail: text(change?.detail, 400),
        })),
      },
      simulationComparison: {
        evidenceClassification: "modeled-simulation-output",
        status: text(report.simulationStatus || "unavailable", 40),
        reason: text(report.simulationReason, 1000),
        metrics: safeArray(report.metrics).slice(0, 12).map((metric) => ({
          key: text(metric?.key, 80), label: text(metric?.label || metric?.key, 120),
          baseline: finite(metric?.before), proposed: finite(metric?.after), delta: finite(metric?.delta), direction: text(metric?.direction, 40),
        })),
        profileConfirmedAtDecisionTime: report.profileConfirmed === true,
        note: "These are synthetic, assumption-driven model outputs from the saved report snapshot, not production measurements.",
      },
      loadTests: {
        evidenceClassification: "user-supplied-load-test-measurements",
        reportSnapshotRecordCount: reportedLoadTestCount,
        recordCountAtExport: currentLoadTestRecordCount,
        includedRecordCount: safeLoadTests.length,
        recordCountsMatch: loadTestCountMatches,
        records: safeLoadTests,
        note: "Records are included as entered or imported by the user. This bundle does not authenticate origin, check live data, or prove workload/environment equivalence with the proposal.",
      },
      decisionValidationGates: gates,
      rolloutChecks,
    },
    riskAssessment: {
      reportedRisks,
      limitations,
      additionalRisks,
      outstandingReadinessChecks: unresolvedChecks,
      outstandingDecisionGates: openGates,
      outstandingRolloutChecks: incompleteRolloutChecks,
      finalHumanApprovalRequired: true,
    },
    interpretationRules: {
      machineDerivedAssessment: "Computed from fields in this saved decision snapshot and record; not an external system validation.",
      manualAttestation: "A recorded user checkbox, note, or reference; not independently verified by this export.",
      userSuppliedMeasurement: "Measurement metadata/data provided by the user or imported by the user; verify source and definitions separately.",
      modeledSimulationOutput: "Synthetic simulation evidence; never treat it alone as proof of production readiness.",
    },
    notes: [...DEFAULT_NOTES],
  };
}
