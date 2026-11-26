import { SEVERITIES, findingKey } from "../helpers/findings.js";

export const REPORT_SCHEMA_VERSION = 1;

const rank = (sev) => SEVERITIES.indexOf(sev);

/**
 * @param {Array<{suite:string,title:string,viewport:object,status:string,durationMs:number,checkpoints:Array,findings:Array,network?:object,error?:string}>} records
 */
export function buildReport(records, meta = {}) {
  const results = records
    .map((r) => ({
      suite: r.suite,
      title: r.title,
      viewport: r.viewport.id,
      status: r.status,
      durationMs: r.durationMs,
      error: r.error || null,
      checkpoints: (r.checkpoints || []).map((c) => ({ name: c.name, screenshot: c.screenshot, findingCount: c.findingCount, stats: c.stats, thumb: c.thumb || null })),
      findings: (r.findings || []).map((f) => ({ ...f, key: findingKey(f) })),
      network: r.network || null,
    }))
    .sort((a, b) => a.suite.localeCompare(b.suite) || a.viewport.localeCompare(b.viewport, undefined, { numeric: true }) || a.title.localeCompare(b.title));

  const viewports = [];
  const seenVp = new Set();
  for (const r of records) {
    if (seenVp.has(r.viewport.id)) continue;
    seenVp.add(r.viewport.id);
    viewports.push({ id: r.viewport.id, name: r.viewport.name, width: r.viewport.width, height: r.viewport.height, isMobile: Boolean(r.viewport.isMobile), hasTouch: Boolean(r.viewport.hasTouch), boundary: Boolean(r.viewport.boundary) });
  }
  viewports.sort((a, b) => a.width - b.width || a.height - b.height);

  const all = results.flatMap((r) => r.findings);
  const bySeverity = Object.fromEntries(SEVERITIES.map((s) => [s, 0]));
  const byCategory = {};
  for (const f of all) {
    bySeverity[f.severity] += 1;
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  }

  // suite x viewport heat-map: worst severity + count
  const matrix = {};
  for (const r of results) {
    const cell = (matrix[r.suite] = matrix[r.suite] || {});
    const c = (cell[r.viewport] = cell[r.viewport] || { status: "passed", worst: null, count: 0 });
    c.count += r.findings.filter((f) => f.category !== "coverage-gap").length;
    for (const f of r.findings) if (f.category !== "coverage-gap" && (c.worst === null || rank(f.severity) < rank(c.worst))) c.worst = f.severity;
    if (r.status === "failed" || r.status === "timedOut") c.status = "failed";
    else if (r.status === "skipped" && c.status === "passed") c.status = "skipped";
  }

  const summary = {
    tests: results.length,
    passed: results.filter((r) => r.status === "passed").length,
    failed: results.filter((r) => r.status === "failed" || r.status === "timedOut").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    flaky: results.filter((r) => r.status === "flaky").length,
    checkpoints: results.reduce((n, r) => n + r.checkpoints.length, 0),
    findings: all.length,
    bySeverity,
    byCategory,
    coverageGaps: all.filter((f) => f.category === "coverage-gap").length,
  };

  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generatedAt: meta.generatedAt || new Date().toISOString(),
    profile: meta.profile || "full",
    failOn: meta.failOn || null,
    summary,
    viewports,
    suites: [...new Set(results.map((r) => r.suite))].sort(),
    matrix,
    results,
  };
}

/**
 * Stable, timestamp-free projection for `git diff` / historical tracking:
 * sorted finding keys with severities, plus per-suite/viewport counts.
 */
export function toDiffable(report) {
  const findings = {};
  for (const r of report.results) for (const f of r.findings) findings[f.key] = f.severity;
  const sorted = Object.fromEntries(Object.entries(findings).sort(([a], [b]) => a.localeCompare(b)));
  const counts = {};
  for (const r of report.results) {
    const k = `${r.suite}@${r.viewport}`;
    counts[k] = { status: r.status, checkpoints: r.checkpoints.length, findings: r.findings.length };
  }
  return {
    schemaVersion: report.schemaVersion,
    profile: report.profile,
    summary: report.summary,
    counts: Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b))),
    findings: sorted,
  };
}

/** Strip heavy inline screenshots for the JSON deliverable. */
export function stripThumbs(report) {
  return { ...report, results: report.results.map((r) => ({ ...r, checkpoints: r.checkpoints.map(({ thumb, ...rest }) => rest) })) };
}

export function diffReports(prev, next) {
  const a = prev.findings || {};
  const b = next.findings || {};
  const added = Object.keys(b).filter((k) => !(k in a)).sort();
  const resolved = Object.keys(a).filter((k) => !(k in b)).sort();
  const changed = Object.keys(b).filter((k) => k in a && a[k] !== b[k]).sort().map((k) => ({ key: k, from: a[k], to: b[k] }));
  return { added, resolved, changed };
}
