import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemDesignReviewReport, renderSystemDesignReviewReportMarkdown } from "../src/features/architecture/systemDesignReviewReport.js";
test("review report combines graph, findings, comparison and decision records", () => {
 const report = buildSystemDesignReviewReport({ title: "Checkout", graph: { nodes: [{id:"api"}], edges: [] }, diagnostics: [{severity:"error", code:"API_DOWN", message:"API lacks redundancy"}], comparison: {winner:"right", scoreDelta:8, metrics:[]}, decisionRecords: [{title:"Queue", status:"accepted", decision:"Use queue"}] });
 assert.equal(report.architecture.componentCount, 1); assert.equal(report.findings.errors, 1); assert.equal(report.comparison.scoreDelta, 8); assert.equal(report.decisionRecords.records.length, 1);
});
test("markdown report includes findings, ADRs and limitations", () => {
 const markdown = renderSystemDesignReviewReportMarkdown(buildSystemDesignReviewReport({ diagnostics:[{severity:"warning",message:"Review cache"}], decisionRecords:[{title:"Caching",decision:"Add cache"}] }));
 assert.match(markdown, /## Findings/); assert.match(markdown, /Review cache/); assert.match(markdown, /Caching/); assert.match(markdown, /does not certify production readiness/);
});
test("report builder safely handles malformed optional collections", () => {
 const report = buildSystemDesignReviewReport({ graph: null, diagnostics: null, decisionRecords: null });
 assert.equal(report.architecture.componentCount, 0); assert.equal(report.findings.total, 0); assert.deepEqual(report.decisionRecords.records, []);
});
