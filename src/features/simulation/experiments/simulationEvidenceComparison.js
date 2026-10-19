export const SIMULATION_EVIDENCE_REPORT_TYPE = "sketchizi-workbench-simulation-evidence";

export function parseSimulationEvidenceReport(source) {
  let report;
  try {
    report = typeof source === "string" ? JSON.parse(source) : source;
  } catch {
    throw new TypeError("File is not valid JSON.");
  }
  if (!report || typeof report !== "object" || Array.isArray(report)) throw new TypeError("Evidence report must be a JSON object.");
  if (report.reportType !== SIMULATION_EVIDENCE_REPORT_TYPE) throw new TypeError("This is not a Sketchizi Workbench simulation evidence report.");
  if (report.schemaVersion !== 1) throw new TypeError(`Unsupported evidence schema version: ${String(report.schemaVersion)}.`);
  if (typeof report.experimentType !== "string" || !report.experimentType.trim()) throw new TypeError("Evidence report is missing its experiment type.");
  if (!report.provenance || typeof report.provenance !== "object") throw new TypeError("Evidence report is missing provenance.");
  return report;
}

function comparableValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function scenarioKey(scenario, index) {
  if (scenario?.id != null) return `${scenario.kind || "scenario"}:${scenario.id}`;
  if (scenario?.multiplier != null) return `traffic:${scenario.multiplier}`;
  if (Array.isArray(scenario?.targets)) return `targets:${scenario.targets.map((target) => target.id || target.name || target.kind).sort().join("+")}`;
  return `row:${index}`;
}

function reportRows(report) {
  const rows = report.points || report.scenarios || report.individualScenarios || [];
  return rows.map((row, index) => ({ key: scenarioKey(row, index), name: row.name || row.label || (row.multiplier != null ? `${row.multiplier}× traffic` : `Scenario ${index + 1}`), row }));
}

export function compareSimulationEvidenceReports(left, right) {
  const warnings = [];
  const leftProvenance = left.provenance || {};
  const rightProvenance = right.provenance || {};
  if (left.experimentType !== right.experimentType) warnings.push("Experiment types differ; row-level comparisons may not be meaningful.");
  if (leftProvenance.modelFingerprint !== rightProvenance.modelFingerprint) warnings.push("Model fingerprints differ; these reports represent different model snapshots.");
  if (leftProvenance.profileFingerprint !== rightProvenance.profileFingerprint) warnings.push("Profile fingerprints differ; assumptions or infrastructure profiles may have changed.");
  if (leftProvenance.engineVersion !== rightProvenance.engineVersion) warnings.push("Simulation engine versions differ.");
  if (JSON.stringify(left.assumptions || {}) !== JSON.stringify(right.assumptions || {})) warnings.push("Experiment assumptions differ; compare only metrics with matching semantics.");
  const aRows = reportRows(left);
  const bRows = reportRows(right);
  const rightByKey = new Map(bRows.map((entry) => [entry.key, entry]));
  const leftKeys = new Set(aRows.map((entry) => entry.key));
  const rows = aRows.map((entry) => {
    const match = rightByKey.get(entry.key);
    const before = comparableValue(entry.row.metrics?.throughputRps);
    const after = comparableValue(match?.row.metrics?.throughputRps);
    const beforeP95 = comparableValue(entry.row.p95LatencyMs ?? entry.row.metrics?.p95LatencyMs);
    const afterP95 = comparableValue(match?.row.p95LatencyMs ?? match?.row.metrics?.p95LatencyMs);
    const beforeFailed = comparableValue(entry.row.failedRatePercent);
    const afterFailed = comparableValue(match?.row.failedRatePercent);
    return {
      key: entry.key,
      name: entry.name,
      matched: Boolean(match),
      beforeThroughputRps: before,
      afterThroughputRps: after,
      throughputDeltaRps: before != null && after != null ? after - before : null,
      beforeP95LatencyMs: beforeP95,
      afterP95LatencyMs: afterP95,
      p95DeltaMs: beforeP95 != null && afterP95 != null ? afterP95 - beforeP95 : null,
      beforeFailedRatePercent: beforeFailed,
      afterFailedRatePercent: afterFailed,
      failedRateDeltaPercentagePoints: beforeFailed != null && afterFailed != null ? afterFailed - beforeFailed : null,
    };
  });
  const unmatchedRows = bRows.filter((entry) => !leftKeys.has(entry.key)).map(({ key, name }) => ({ key, name }));
  if (rows.some((row) => !row.matched) || unmatchedRows.length) warnings.push("Scenario sets differ; unmatched rows are shown without fabricated deltas.");
  if (!aRows.length || !bRows.length) warnings.push("One or both reports have no comparable scenario rows.");
  return {
    status: "compared",
    left: { experimentType: left.experimentType, modelRevision: leftProvenance.modelRevision ?? null, modelFingerprint: leftProvenance.modelFingerprint ?? null, profileFingerprint: leftProvenance.profileFingerprint ?? null, engineVersion: leftProvenance.engineVersion ?? null, scenarioCount: aRows.length },
    right: { experimentType: right.experimentType, modelRevision: rightProvenance.modelRevision ?? null, modelFingerprint: rightProvenance.modelFingerprint ?? null, profileFingerprint: rightProvenance.profileFingerprint ?? null, engineVersion: rightProvenance.engineVersion ?? null, scenarioCount: bRows.length },
    warnings,
    rows,
    unmatchedRows,
  };
}
