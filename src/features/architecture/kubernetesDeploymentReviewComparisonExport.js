const safeText = (value) => (typeof value === "string" ? value : "");

function stableComparisonReference(entry, finding) {
  // Hash the comparison identity rather than exposing it in the reference.
  const identity = safeText(entry?.identity) || [
    finding?.code || "",
    finding?.resourceId || "",
    finding?.relationshipId || "",
  ].join("\\u001f");
  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `K8S-${(hash >>> 0).toString(16).toUpperCase().padStart(8, "0")}`;
}

function findingSummary(finding) {
  if (!finding || typeof finding !== "object") return null;
  return {
    id: safeText(finding.id || finding.diagnosticId),
    code: safeText(finding.code),
    severity: safeText(finding.severity),
    message: safeText(finding.message),
    remediation: safeText(finding.remediation),
    resourceId: safeText(finding.resourceId),
    relationshipId: safeText(finding.relationshipId),
    relationshipType: safeText(finding.relationshipType),
    source: finding.source && typeof finding.source === "object"
      ? { id: safeText(finding.source.id), type: safeText(finding.source.type) }
      : null,
    target: finding.target && typeof finding.target === "object"
      ? { id: safeText(finding.target.id), type: safeText(finding.target.type) }
      : null,
  };
}

function comparisonEntry(entry, category) {
  const current = category === "resolved" ? null : findingSummary(entry?.finding);
  const previous = category === "added" ? null : findingSummary(entry?.previous);
  const changes = {};
  if (entry?.changes?.severity) changes.severity = { from: previous?.severity || "", to: current?.severity || "" };
  if (entry?.changes?.message) changes.message = { from: previous?.message || "", to: current?.message || "" };
  if (entry?.changes?.remediation) changes.remediation = { from: previous?.remediation || "", to: current?.remediation || "" };
  if (entry?.changes?.relationship) changes.relationship = {
    from: {
      type: previous?.relationshipType || "",
      id: previous?.relationshipId || "",
      source: previous?.source || null,
      target: previous?.target || null,
    },
    to: {
      type: current?.relationshipType || "",
      id: current?.relationshipId || "",
      source: current?.source || null,
      target: current?.target || null,
    },
  };
  const referenceSource = current || previous;
  return {
    findingRef: stableComparisonReference(entry, referenceSource),
    category,
    finding: current,
    previous,
    changes,
  };
}

/** Build a privacy-conscious, JSON-safe report from a comparison result. */
export function buildKubernetesDeploymentReviewComparisonExport({ comparison, baseline, current, generatedAt } = {}) {
  const result = comparison && typeof comparison === "object" ? comparison : {};
  const counts = result.counts && typeof result.counts === "object" ? result.counts : {};
  const mapEntries = (key) => (Array.isArray(result[key]) ? result[key] : []).map((entry) => comparisonEntry(entry, key));
  const generated = generatedAt || new Date().toISOString();
  const changes = {
    added: mapEntries("added"),
    changed: mapEntries("changed"),
    resolved: mapEntries("resolved"),
    unchanged: mapEntries("unchanged"),
  };
  return {
    reportType: "sketchizi-kubernetes-deployment-review-comparison",
    reportVersion: "1.13.7",
    schemaVersion: 2,
    metadata: {
      generatedAt: generated,
      reportVersion: "1.13.7",
      schemaVersion: 2,
      findingReferenceScheme: "K8S-FNV1A32-COMPARISON-v1",
      scope: "sanitized-diagram-snapshot-comparison",
    },
    generatedAt: generated,
    baseline: {
      generatedAt: baseline?.generatedAt || result.baselineGeneratedAt || null,
      title: safeText(baseline?.title),
      findingCount: Array.isArray(baseline?.findings) ? baseline.findings.length : Number(counts.baseline) || 0,
    },
    current: {
      generatedAt: current?.generatedAt || result.currentGeneratedAt || null,
      title: safeText(current?.title),
      findingCount: Array.isArray(current?.findings) ? current.findings.length : Number(counts.current) || 0,
    },
    summary: {
      added: Number(counts.added) || 0,
      changed: Number(counts.changed) || 0,
      resolved: Number(counts.resolved) || 0,
      unchanged: Number(counts.unchanged) || 0,
      current: Number(counts.current) || 0,
      baseline: Number(counts.baseline) || 0,
      severityIncreased: Number(counts.severityIncreased) || 0,
      severityDecreased: Number(counts.severityDecreased) || 0,
    },
    changes,
    remediationChanges: {
      changed: changes.changed.filter((entry) => Boolean(entry.changes.remediation)).length,
      withPreviousRemediation: changes.resolved.filter((entry) => Boolean(entry.previous?.remediation)).length,
      withSuggestedRemediation: changes.added.filter((entry) => Boolean(entry.finding?.remediation)).length,
    },
    scopeNote: safeText(result.scopeNote) || "This comparison reflects diagram-validation snapshots, not a live Kubernetes cluster comparison.",
    privacyNote: "This report contains sanitized Kubernetes validation findings only. It excludes the full diagram and arbitrary metadata.",
  };
}

function markdownValue(value) {
  return safeText(value).replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
}

function findingLine(finding) {
  if (!finding) return "";
  return `- **${markdownValue(finding.code || "Finding")}** (${markdownValue(finding.severity || "unknown")}) — ${markdownValue(finding.message || "No message provided")}`;
}

/** Render a human-readable comparison report with explicit before/after details. */
export function renderKubernetesDeploymentReviewComparisonMarkdown(report) {
  const safeReport = report && typeof report === "object" ? report : {};
  const summary = safeReport.summary || {};
  const changes = safeReport.changes || {};
  const lines = [
    "# Sketchizi Kubernetes Deployment Review Comparison",
    "",
    `- Report version: ${markdownValue(safeReport.metadata?.reportVersion || safeReport.reportVersion || "unknown")}`,
    `- Schema version: ${Number(safeReport.metadata?.schemaVersion || safeReport.schemaVersion) || 1}`,
    `- Reference scheme: ${markdownValue(safeReport.metadata?.findingReferenceScheme || "unknown")}`,
    `- Generated: ${markdownValue(safeReport.metadata?.generatedAt || safeReport.generatedAt || "unknown")}`,
    `- Baseline: ${markdownValue(safeReport.baseline?.generatedAt || "unknown")} (${Number(safeReport.baseline?.findingCount) || 0} findings)`,
    `- Current: ${markdownValue(safeReport.current?.generatedAt || "unknown")} (${Number(safeReport.current?.findingCount) || 0} findings)`,
    "",
    "## Summary",
    "",
    `- New findings: ${Number(summary.added) || 0}`,
    `- Changed findings: ${Number(summary.changed) || 0}`,
    `- Resolved findings: ${Number(summary.resolved) || 0}`,
    `- Unchanged findings: ${Number(summary.unchanged) || 0}`,
    `- Severity increased: ${Number(summary.severityIncreased) || 0}`,
    `- Severity decreased: ${Number(summary.severityDecreased) || 0}`,
    `- Changed remediation guidance: ${Number(safeReport.remediationChanges?.changed) || 0}`,
  ];
  for (const [key, heading] of [["added", "New findings"], ["changed", "Changed findings"], ["resolved", "Resolved findings"]]) {
    lines.push("", `## ${heading}`, "");
    const entries = Array.isArray(changes[key]) ? changes[key] : [];
    if (!entries.length) {
      lines.push("_None._");
      continue;
    }
    for (const entry of entries) {
      const finding = entry.finding || entry.previous;
      lines.push(`**Reference:** ${markdownValue(entry.findingRef || "K8S-UNASSIGNED")}`);
      lines.push(findingLine(finding));
      if (key === "changed") {
        for (const [field, change] of Object.entries(entry.changes || {})) {
          if (field === "relationship") {
            lines.push(`  - Relationship: \`${markdownValue(JSON.stringify(change.from))}\` → \`${markdownValue(JSON.stringify(change.to))}\``);
          } else {
            lines.push(`  - ${field[0].toUpperCase()}${field.slice(1)}: \`${markdownValue(change.from)}\` → \`${markdownValue(change.to)}\``);
          }
        }
      } else if (key === "resolved" && entry.previous?.remediation) {
        lines.push(`  - Previous remediation: ${markdownValue(entry.previous.remediation)}`);
      } else if (key === "added" && entry.finding?.remediation) {
        lines.push(`  - Remediation: ${markdownValue(entry.finding.remediation)}`);
      }
    }
  }
  lines.push("", "## Scope and privacy", "", markdownValue(safeReport.scopeNote), "", markdownValue(safeReport.privacyNote), "");
  return lines.join("\n");
}
