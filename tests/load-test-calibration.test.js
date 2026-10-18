import test from "node:test";
import assert from "node:assert/strict";
import {
  assessLoadTestEvidence,
  compareLoadTestToSimulation,
  createEmptyLoadTestRecord,
  createLoadTestJsonTemplate,
  normalizeLoadTestRecord,
  parseLoadTestEvidenceJson,
  parseJMeterLoadTestText,
  proposeServiceTimeCalibrations,
} from "../src/features/simulation/experiments/loadTestCalibration.js";
import { createIllustrativeSimulationProfile } from "../src/features/simulation/experiments/simulationExperimentModel.js";

function record(overrides = {}) {
  const value = createEmptyLoadTestRecord();
  return normalizeLoadTestRecord({
    ...value,
    name: "Load test",
    testedAt: "2026-10-18",
    targetEnvironment: "prod-api-tier-a",
    source: "k6 + Prometheus",
    workload: { durationSeconds: 60, offeredRps: 50, concurrency: 100 },
    observed: {
      ...value.observed,
      throughputRps: 48,
      p95LatencyMs: 82,
      errorRatePercent: 0.5,
      appCpuPercent: 65,
      appMemoryGb: 1.4,
      dbCpuPercent: 42,
      dbConnections: 24,
      dbP95QueryMs: 18,
    },
    ...overrides,
  });
}

test("load-test records validate environment, source, offered load and measurement ranges", () => {
  assert.throws(() => normalizeLoadTestRecord({}), /name/);
  assert.throws(() => record({ targetEnvironment: "" }), /target environment/);
  assert.throws(() => record({ source: "" }), /source/);
  assert.throws(() => record({ testedAt: "not-a-date" }), /test date/);
  assert.throws(() => record({ workload: { durationSeconds: 60, offeredRps: 0 } }), /Offered load/);
  assert.throws(() => record({ observed: { ...createEmptyLoadTestRecord().observed, errorRatePercent: 101 } }), /Failed \/ timed-out request rate/);
});

test("load-test JSON import accepts a single record or list and rejects invalid JSON", () => {
  const source = JSON.stringify({
    name: "single",
    testedAt: "2026-10-18",
    targetEnvironment: "env-a",
    source: "JMeter",
    workload: { durationSeconds: 30, offeredRps: 10 },
    observed: { throughputRps: 9, p95LatencyMs: 90, errorRatePercent: 0 },
  });
  assert.equal(parseLoadTestEvidenceJson(source).length, 1);
  assert.equal(parseLoadTestEvidenceJson(JSON.stringify([JSON.parse(source), { ...JSON.parse(source), name: "second", workload: { durationSeconds: 30, offeredRps: 20 } }])).length, 2);
  assert.throws(() => parseLoadTestEvidenceJson("{nope"), /Invalid JSON/);
  assert.throws(() => parseLoadTestEvidenceJson("[]"), /no load-test records/);
});

test("empty JSON template contains no invented measured values", () => {
  const parsed = JSON.parse(createLoadTestJsonTemplate());
  assert.equal(parsed.records[0].workload.offeredRps, null);
  assert.equal(parsed.records[0].observed.throughputRps, null);
  assert.equal(parsed.records[0].observed.p95LatencyMs, null);
  assert.equal(parsed.records[0].targetEnvironment, "");
});

test("cross-load evidence readiness requires three complete tests over at least two offered-load levels", () => {
  const partial = [record({ name: "one" }), record({ name: "two" })];
  assert.equal(assessLoadTestEvidence(partial).readyForCrossLoadAssessment, false);
  const enough = [
    record({ name: "low-1", workload: { durationSeconds: 60, offeredRps: 20 } }),
    record({ name: "low-2", workload: { durationSeconds: 60, offeredRps: 21 } }),
    record({ name: "high-1", workload: { durationSeconds: 60, offeredRps: 60 } }),
  ];
  const assessment = assessLoadTestEvidence(enough);
  assert.equal(assessment.readyForCrossLoadAssessment, true);
  assert.equal(assessment.comparisonReadyCount, 3);
  assert.equal(assessment.workloadLevelCount, 2);
  assert.match(assessment.message, /does not certify production accuracy/);
});

test("cross-load readiness never mixes measurements from different target environments", () => {
  const mixed = [
    record({ name: "env A low", targetEnvironment: "env-a", workload: { durationSeconds: 60, offeredRps: 20 } }),
    record({ name: "env B medium", targetEnvironment: "env-b", workload: { durationSeconds: 60, offeredRps: 40 } }),
    record({ name: "env C high", targetEnvironment: "env-c", workload: { durationSeconds: 60, offeredRps: 60 } }),
  ];
  const assessment = assessLoadTestEvidence(mixed);
  assert.equal(assessment.comparisonReadyCount, 3);
  assert.equal(assessment.readyForCrossLoadAssessment, false);
  assert.match(assessment.message, /same target environment/);
});

test("simulation comparison flags mismatched offered load and keeps model drops distinct from measured errors", () => {
  const measured = record({ workload: { durationSeconds: 60, offeredRps: 10 } });
  const sim = {
    simulation: { durationMs: 15000 },
    metrics: {
      offeredRequests: 750,
      observationWindowMs: 15000,
      throughputRps: 48,
      successfulLatencyMs: { p95: 100 },
      failedRequests: 5,
      droppedRequests: 25,
    },
  };
  const comparison = compareLoadTestToSimulation(sim, measured);
  assert.equal(comparison.status, "workload-mismatch");
  assert.equal(comparison.rows.find((row) => row.key === "errorRatePercent").simulated, 5 / 750 * 100);
  assert.equal(comparison.rows.find((row) => row.key === "droppedRatePercent").measured, null);
  assert.match(comparison.reason, /offered load delta/);
});

test("comparison is marked comparable only when workload aligns and key measured values exist", () => {
  const measured = record({ workload: { durationSeconds: 15, offeredRps: 50 } });
  const sim = {
    simulation: { durationMs: 15000 },
    metrics: { offeredRequests: 750, observationWindowMs: 15000, throughputRps: 48, successfulLatencyMs: { p95: 80 }, failedRequests: 3, droppedRequests: 4 },
  };
  const comparison = compareLoadTestToSimulation(sim, measured);
  assert.equal(comparison.status, "comparable");
  assert.equal(comparison.rows.find((row) => row.key === "offeredRps").simulated, 50);
  assert.equal(comparison.rows.find((row) => row.key === "droppedRatePercent").measured, null);
  assert.equal(comparison.measuredContext.appCpuPercent, 65);
  const incomplete = compareLoadTestToSimulation(sim, record({ observed: { throughputRps: 48, p95LatencyMs: null, errorRatePercent: null } }));
  assert.equal(incomplete.status, "incomplete");
});

test("comparison also flags an observation-window mismatch when offered load is aligned", () => {
  const measured = record({ workload: { durationSeconds: 60, offeredRps: 50 } });
  const sim = {
    simulation: { durationMs: 15000 },
    metrics: { offeredRequests: 750, observationWindowMs: 15000, throughputRps: 48, successfulLatencyMs: { p95: 80 }, failedRequests: 3, droppedRequests: 4 },
  };
  const comparison = compareLoadTestToSimulation(sim, measured);
  assert.equal(comparison.workloadDeltaPercent, 0);
  assert.equal(comparison.durationDeltaPercent, 75);
  assert.equal(comparison.status, "workload-mismatch");
  assert.match(comparison.reason, /observation window/);
});

test("service-time proposals require repeated component measurements across load levels in one environment", () => {
  const workbench = { entities: [
    { id: "api", kind: "backend.rest-service", name: "REST API" },
    { id: "db", kind: "data.postgresql-database", name: "PostgreSQL" },
  ] };
  const profile = createIllustrativeSimulationProfile(workbench);
  const tests = [
    record({ id: "a", name: "20 rps", workload: { durationSeconds: 60, offeredRps: 20 }, observed: { ...createEmptyLoadTestRecord().observed, throughputRps: 19, p95LatencyMs: 100, errorRatePercent: 0, restExclusiveMeanServiceMs: 20, restServiceSampleCount: 100, dbMeanQueryServiceMs: 10, dbServiceSampleCount: 200 } }),
    record({ id: "b", name: "40 rps", workload: { durationSeconds: 60, offeredRps: 40 }, observed: { ...createEmptyLoadTestRecord().observed, throughputRps: 38, p95LatencyMs: 150, errorRatePercent: 0.1, restExclusiveMeanServiceMs: 30, restServiceSampleCount: 100, dbMeanQueryServiceMs: 12, dbServiceSampleCount: 200 } }),
    record({ id: "c", name: "40 rps repeat", workload: { durationSeconds: 60, offeredRps: 40 }, observed: { ...createEmptyLoadTestRecord().observed, throughputRps: 38, p95LatencyMs: 155, errorRatePercent: 0.2, restExclusiveMeanServiceMs: 25, restServiceSampleCount: 200, dbMeanQueryServiceMs: 11, dbServiceSampleCount: 100 } }),
  ];
  const proposals = proposeServiceTimeCalibrations(tests, workbench, profile);
  const rest = proposals.find((proposal) => proposal.entityId === "api");
  const db = proposals.find((proposal) => proposal.entityId === "db");
  assert.equal(rest.proposedValue, 25);
  assert.equal(rest.sampleCount, 400);
  assert.equal(rest.testCount, 3);
  assert.equal(db.proposedValue, 11);
  assert.equal(db.sampleCount, 500);
  assert.equal(rest.changed, false); // REST already matches the measured weighted mean.
  assert.equal(db.changed, true);
  assert.equal(proposeServiceTimeCalibrations(tests.slice(0, 2), workbench, profile).length, 0);
  const differentEnvironments = tests.map((item, index) => ({ ...item, targetEnvironment: `env-${index}` }));
  assert.equal(proposeServiceTimeCalibrations(differentEnvironments, workbench, profile).length, 0);
});

test("aggregate latency alone is never used to infer service-time parameters", () => {
  const workbench = { entities: [{ id: "api", kind: "backend.rest-service", name: "REST API" }] };
  const profile = createIllustrativeSimulationProfile(workbench);
  const tests = [20, 40, 60].map((rps, index) => record({ id: `r${index}`, name: `test ${index}`, workload: { durationSeconds: 60, offeredRps: rps } }));
  assert.equal(proposeServiceTimeCalibrations(tests, workbench, profile).length, 0);
});

test("k6 summary JSON is adapted only when explicit Sketchizi workload/environment metadata is supplied", () => {
  const k6 = {
    metrics: {
      http_reqs: { values: { rate: 50 } },
      http_req_failed: { values: { rate: 0.02 } },
      http_req_duration: { values: { "p(95)": 120 } },
      vus_max: { values: { max: 80 } },
    },
    sketchizi: {
      name: "k6 sustained load", testedAt: "2026-10-18", targetEnvironment: "staging-api-a",
      durationSeconds: 60, offeredRps: 50,
    },
  };
  const [result] = parseLoadTestEvidenceJson(JSON.stringify(k6));
  assert.equal(result.source, "k6 summary JSON");
  assert.equal(result.workload.offeredRps, 50);
  assert.equal(result.workload.concurrency, 80);
  assert.equal(result.observed.throughputRps, 49);
  assert.equal(result.observed.p95LatencyMs, 120);
  assert.equal(result.observed.errorRatePercent, 2);
  assert.match(result.notes, /Imported from k6 summary JSON/);
  assert.throws(() => parseLoadTestEvidenceJson(JSON.stringify({ metrics: k6.metrics })), /Add a top-level 'sketchizi' object/);
});


test("JMeter sample CSV imports successful throughput, elapsed-time p95, error rate, and active threads", () => {
  const csv = [
    "timeStamp,elapsed,label,responseCode,success,allThreads,threadName",
    '1000,10,"GET /items, list",200,true,4,group-1',
    "2000,20,GET /items,500,false,5,group-1",
    "3000,30,GET /items,200,true,7,group-2",
    "4000,40,GET /items,200,true,6,group-2",
  ].join("\n");
  const [result] = [parseJMeterLoadTestText(csv, {
    name: "JMeter catalog test", testedAt: "2026-10-18", targetEnvironment: "staging-api-a",
    offeredRps: "10", durationSeconds: "10",
  }, "csv")];
  assert.equal(result.source, "Apache JMeter sample CSV JTL");
  assert.equal(result.workload.offeredRps, 10); // Explicit metadata, not inferred from JTL completions.
  assert.equal(result.workload.concurrency, 7);
  assert.equal(result.observed.throughputRps, 0.3);
  assert.equal(result.observed.p95LatencyMs, 40);
  assert.equal(result.observed.errorRatePercent, 25);
  assert.match(result.notes, /not inferred from completed samples/);
});

test("JMeter XML JTL imports sample elements and avoids double-counting transaction parents", () => {
  const xml = '<?xml version="1.0"?><testResults><httpSample t="250" ts="1000" s="true" lb="transaction" na="9"><httpSample t="50" ts="1000" s="true" lb="GET /a" na="8"/><httpSample t="200" ts="1000" s="true" lb="GET /b" na="8"/></httpSample><httpSample t="500" ts="2000" s="false" lb="GET /c" na="10"/></testResults>';
  const result = parseJMeterLoadTestText(xml, {
    name: "JMeter XML", testedAt: "2026-10-18", targetEnvironment: "staging-api-a",
    offeredRps: 12, durationSeconds: 10,
  }, "xml");
  assert.equal(result.source, "Apache JMeter XML JTL");
  assert.equal(result.workload.concurrency, 10);
  assert.equal(result.observed.throughputRps, 0.2);
  assert.equal(result.observed.p95LatencyMs, 500);
  assert.equal(result.observed.errorRatePercent, 1 / 3 * 100);
  assert.match(result.notes, /3 sample rows/);
});

test("JMeter imports require explicit workload metadata and do not accept aggregate report CSV", () => {
  const csv = "timeStamp,elapsed,success\n1000,10,true";
  const metadata = { name: "JMeter", testedAt: "2026-10-18", targetEnvironment: "staging", offeredRps: 10, durationSeconds: 10 };
  assert.throws(() => parseJMeterLoadTestText(csv, { ...metadata, offeredRps: "" }, "csv"), /offered request rate explicitly/);
  assert.throws(() => parseJMeterLoadTestText(csv, { ...metadata, durationSeconds: "" }, "csv"), /configured load-test duration/);
  const aggregate = "sampler_label,#Samples,Average,Median,90%Line,95%Line,99%Line,Min,Max,Error%,Throughput\nGET /items,100,20,18,40,55,80,5,90,0.0%,10";
  assert.throws(() => parseJMeterLoadTestText(aggregate, metadata, "csv"), /Aggregate Report CSV/);
});

test("JMeter imports reject unsafe XML declarations, malformed rows, and oversized samples", () => {
  const metadata = { name: "JMeter", testedAt: "2026-10-18", targetEnvironment: "staging", offeredRps: 10, durationSeconds: 10 };
  assert.throws(() => parseJMeterLoadTestText('<!DOCTYPE testResults [<!ENTITY x "x">]><testResults/>', metadata, "xml"), /DOCTYPE or ENTITY/);
  assert.throws(() => parseJMeterLoadTestText('<testResults><httpSample t="1" ts="1000" s="true"></testResults>', metadata, "xml"), /closing tag .* does not match/);
  assert.throws(() => parseJMeterLoadTestText("timeStamp,elapsed,success\nnope,10,true", metadata, "csv"), /invalid timestamp or elapsed/);
  assert.throws(() => parseJMeterLoadTestText("x".repeat(10 * 1024 * 1024 + 1), metadata, "csv"), /limited to 10 MB/);
});
