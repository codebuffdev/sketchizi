/**
 * User-supplied load-test evidence used to compare the synthetic Workbench
 * model with a real workload. This module never discovers infrastructure and
 * never changes simulation parameters automatically.
 */
export const LOAD_TEST_EVIDENCE_SCHEMA_VERSION = 1;
export const MAX_LOAD_TEST_RECORDS = 25;

const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const clone = (value) => structuredClone(value);
const numeric = (value) => typeof value === "number" && Number.isFinite(value);

export const LOAD_TEST_MEASUREMENT_FIELDS = Object.freeze([
  { key: "throughputRps", label: "Successful throughput (req/s)", min: 0, max: 100000000, step: 0.1, group: "request" },
  { key: "p95LatencyMs", label: "End-to-end p95 latency (ms)", min: 0, max: 3600000, step: 0.1, group: "request" },
  { key: "errorRatePercent", label: "Failed / timed-out request rate (%)", min: 0, max: 100, step: 0.1, group: "request" },
  { key: "appCpuPercent", label: "REST application CPU (%)", min: 0, max: 100, step: 0.1, group: "resource" },
  { key: "appMemoryGb", label: "REST application memory used (GB)", min: 0, max: 1048576, step: 0.1, group: "resource" },
  { key: "dbCpuPercent", label: "Database CPU (%)", min: 0, max: 100, step: 0.1, group: "resource" },
  { key: "dbConnections", label: "Database active connections", min: 0, max: 10000000, step: 1, group: "resource" },
  { key: "dbP95QueryMs", label: "Database query p95 (ms)", min: 0, max: 3600000, step: 0.1, group: "resource" },
  { key: "restExclusiveMeanServiceMs", label: "REST exclusive mean processing time (ms)", min: 0.1, max: 3600000, step: 0.1, group: "service" },
  { key: "restServiceSampleCount", label: "REST service-time sample count", min: 1, max: 1000000000, step: 1, group: "service" },
  { key: "dbMeanQueryServiceMs", label: "Database mean query execution time (ms)", min: 0.1, max: 3600000, step: 0.1, group: "service" },
  { key: "dbServiceSampleCount", label: "Database service-time sample count", min: 1, max: 1000000000, step: 1, group: "service" },
]);

export function createEmptyLoadTestRecord() {
  return {
    schemaVersion: LOAD_TEST_EVIDENCE_SCHEMA_VERSION,
    id: "",
    name: "",
    testedAt: "",
    targetEnvironment: "",
    source: "",
    workload: { durationSeconds: 60, offeredRps: null, concurrency: null },
    observed: Object.fromEntries(LOAD_TEST_MEASUREMENT_FIELDS.map((field) => [field.key, null])),
    notes: "",
  };
}

function parseOptionalNumber(value, label, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!numeric(number) || number < min || number > max || (integer && !Number.isInteger(number))) {
    throw new TypeError(`${label} must be ${integer ? "an integer" : "a number"} from ${min} to ${max}.`);
  }
  return number;
}

export function normalizeLoadTestRecord(input, { id = null } = {}) {
  if (!isRecord(input)) throw new TypeError("Each load-test record must be a JSON object.");
  const base = createEmptyLoadTestRecord();
  const name = String(input.name || input.label || "").trim();
  const testedAt = String(input.testedAt || input.testDate || "").trim();
  const targetEnvironment = String(input.targetEnvironment || input.environment || "").trim();
  const source = String(input.source || input.sourceTool || "").trim();
  if (!name) throw new TypeError("Load-test record needs a name (for example, '5× traffic test').");
  if (!testedAt || !/^\d{4}-\d{2}-\d{2}$/.test(testedAt) || Number.isNaN(Date.parse(`${testedAt}T00:00:00Z`))) {
    throw new TypeError("Load-test record needs a valid test date in YYYY-MM-DD format.");
  }
  if (!targetEnvironment) throw new TypeError("Load-test record needs a target environment identifier so unlike deployments are not mixed.");
  if (!source) throw new TypeError("Load-test record needs a source (for example, k6, JMeter, or APM export).");

  const workloadInput = isRecord(input.workload) ? input.workload : input;
  const observedInput = isRecord(input.observed) ? input.observed : input;
  const workload = {
    durationSeconds: parseOptionalNumber(workloadInput.durationSeconds ?? 60, "Test duration (seconds)", { min: 1, max: 604800 }),
    offeredRps: parseOptionalNumber(workloadInput.offeredRps ?? workloadInput.offeredRequestsPerSecond, "Offered load (req/s)", { min: 0.001, max: 100000000 }),
    concurrency: parseOptionalNumber(workloadInput.concurrency, "Concurrent virtual users / clients", { min: 1, max: 100000000, integer: true }),
  };
  if (workload.offeredRps === null) throw new TypeError("Load-test record needs the offered request rate in req/s.");

  const observed = {};
  for (const field of LOAD_TEST_MEASUREMENT_FIELDS) {
    observed[field.key] = parseOptionalNumber(observedInput[field.key], field.label, {
      min: field.min,
      max: field.max,
      integer: field.key.endsWith("SampleCount") || field.key === "dbConnections",
    });
  }
  for (const [meanKey, countKey] of [["restExclusiveMeanServiceMs", "restServiceSampleCount"], ["dbMeanQueryServiceMs", "dbServiceSampleCount"]]) {
    if (observed[meanKey] !== null && observed[countKey] === null) {
      throw new TypeError(`${countKey === "restServiceSampleCount" ? "REST" : "Database"} sample count is required when a mean service time is provided.`);
    }
  }
  if (!Object.values(observed).some((value) => value !== null)) throw new TypeError("Enter at least one measured result before saving the load test.");

  const idValue = String(id || input.id || "").trim();
  return {
    ...base,
    ...clone(input),
    schemaVersion: LOAD_TEST_EVIDENCE_SCHEMA_VERSION,
    id: idValue || `load-test-${testedAt.replaceAll("-", "")}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    testedAt,
    targetEnvironment,
    source,
    workload,
    observed,
    notes: String(input.notes || "").slice(0, 4000),
  };
}

export function ensureLoadTestEvidenceDefaults(evidence) {
  const rawRecords = isRecord(evidence) && Array.isArray(evidence.records) ? evidence.records.slice(0, MAX_LOAD_TEST_RECORDS) : [];
  const records = [];
  const ids = new Set();
  for (const raw of rawRecords) {
    try {
      const item = normalizeLoadTestRecord(raw);
      if (ids.has(item.id)) continue;
      ids.add(item.id);
      records.push(item);
    } catch { /* Ignore malformed historical evidence instead of blocking document open. */ }
  }
  return { schemaVersion: LOAD_TEST_EVIDENCE_SCHEMA_VERSION, records };
}

export function normalizeLoadTestEvidence(evidence) {
  if (!isRecord(evidence)) return { schemaVersion: LOAD_TEST_EVIDENCE_SCHEMA_VERSION, records: [] };
  const rawRecords = Array.isArray(evidence.records) ? evidence.records : [];
  const records = rawRecords.slice(0, MAX_LOAD_TEST_RECORDS).map((record) => normalizeLoadTestRecord(record));
  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.id)) throw new TypeError(`Duplicate load-test record ID: ${record.id}.`);
    seen.add(record.id);
  }
  return { schemaVersion: LOAD_TEST_EVIDENCE_SCHEMA_VERSION, records };
}

function adaptK6Summary(parsed) {
  const metrics = parsed?.metrics;
  if (!isRecord(metrics) || !isRecord(metrics.http_reqs) || !isRecord(metrics.http_req_duration)) return null;
  const metadata = parsed.sketchizi;
  if (!isRecord(metadata)) {
    throw new TypeError("Detected a k6 summary export. Add a top-level 'sketchizi' object with name, testedAt, targetEnvironment, durationSeconds, and offeredRps; k6 summaries do not reliably contain all of this context.");
  }
  const offeredRate = metrics.http_reqs.values?.rate;
  const failedRate = metrics.http_req_failed?.values?.rate;
  const p95 = metrics.http_req_duration.values?.['p(95)'];
  if (![offeredRate, failedRate, p95].every(numeric)) {
    throw new TypeError("The k6 summary must include http_reqs.rate, http_req_failed.rate, and http_req_duration.p(95) metrics.");
  }
  if (failedRate < 0 || failedRate > 1) throw new TypeError("k6 http_req_failed.rate must be a fraction from 0 to 1.");
  const vus = metrics.vus_max?.values?.max ?? metrics.vus?.values?.max ?? null;
  return {
    name: metadata.name,
    testedAt: metadata.testedAt,
    targetEnvironment: metadata.targetEnvironment,
    source: metadata.source || "k6 summary JSON",
    workload: {
      durationSeconds: metadata.durationSeconds,
      offeredRps: metadata.offeredRps,
      concurrency: metadata.concurrency ?? (numeric(vus) ? Math.round(vus) : null),
    },
    observed: {
      throughputRps: offeredRate * (1 - failedRate),
      p95LatencyMs: p95,
      errorRatePercent: failedRate * 100,
    },
    notes: `Imported from k6 summary JSON. http_reqs.rate=${offeredRate} req/s; successful throughput is estimated as http_reqs.rate × (1 − http_req_failed.rate). Confirm this interpretation matches the test's metric definitions. ${metadata.notes || ""}`.trim(),
  };
}

export function parseLoadTestEvidenceJson(source) {
  let parsed;
  try { parsed = JSON.parse(source); } catch (error) { throw new TypeError(`Invalid JSON: ${error.message}`); }
  const adaptedK6 = adaptK6Summary(parsed);
  const rawRecords = adaptedK6 ? [adaptedK6] : Array.isArray(parsed) ? parsed : (isRecord(parsed) && Array.isArray(parsed.records) ? parsed.records : [parsed]);
  if (!rawRecords.length) throw new TypeError("The JSON contains no load-test records.");
  if (rawRecords.length > MAX_LOAD_TEST_RECORDS) throw new RangeError(`Import at most ${MAX_LOAD_TEST_RECORDS} load-test records at once.`);
  const normalized = rawRecords.map((record) => normalizeLoadTestRecord(record));
  const duplicate = normalized.find((record, index) => normalized.findIndex((other) => other.id === record.id) !== index);
  if (duplicate) throw new TypeError(`Duplicate load-test record ID: ${duplicate.id}.`);
  return normalized;
}

const MAX_JMETER_IMPORT_CHARS = 10 * 1024 * 1024;
const MAX_JMETER_SAMPLES = 250000;
const JMETER_SAMPLE_TAGS = new Set(["sample", "httpSample", "sampleResult"]);

function decodeXmlAttribute(value) {
  return String(value).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}

function parseXmlAttributes(raw) {
  const attributes = {};
  const matcher = /([^\s=<>/]+)\s*=\s*(["'])(.*?)\2/g;
  let match;
  while ((match = matcher.exec(raw))) attributes[match[1]] = decodeXmlAttribute(match[3]);
  return attributes;
}

function parseJMeterCsv(source) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const input = source.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell.length === 0) quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[index + 1] === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((item) => item.trim() !== "")) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (quoted) throw new TypeError("JMeter CSV contains an unterminated quoted field.");
  if (cell.length || row.length) { row.push(cell); if (row.some((item) => item.trim() !== "")) rows.push(row); }
  if (rows.length < 2) throw new TypeError("JMeter CSV must contain a header and at least one sample row.");
  const headers = rows[0].map((value) => value.trim().replace(/^\uFEFF/, "").toLowerCase().replace(/[^a-z0-9]/g, ""));
  const index = (...names) => headers.findIndex((header) => names.includes(header));
  const timestampIndex = index("timestamp", "ts");
  const elapsedIndex = index("elapsed", "elapsedms", "t");
  const successIndex = index("success", "s");
  const labelIndex = index("label", "samplerlabel", "lb");
  const allThreadsIndex = index("allthreads", "nathreads", "activeusers");
  const responseCodeIndex = index("responsecode", "rc");
  if (timestampIndex < 0 || elapsedIndex < 0 || successIndex < 0) {
    if (headers.some((header) => ["throughput", "95line", "95thpercentile", "samples", "errors"].includes(header))) {
      throw new TypeError("This looks like a JMeter Aggregate Report CSV. Aggregate rows cannot be combined into a trustworthy global p95; export the raw sample-level JTL CSV with timeStamp, elapsed, and success columns instead.");
    }
    throw new TypeError("JMeter sample CSV needs timeStamp, elapsed, and success columns. Export the raw sample-level JTL results, not an aggregate report.");
  }
  const samples = [];
  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const values = rows[rowIndex];
    if (values.length === 1 && !values[0].trim()) continue;
    const timestamp = Number(values[timestampIndex]);
    const elapsed = Number(values[elapsedIndex]);
    const rawSuccess = String(values[successIndex] ?? "").trim().toLowerCase();
    if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(elapsed) || elapsed < 0) {
      throw new TypeError(`JMeter CSV row ${rowIndex + 1} has an invalid timestamp or elapsed time.`);
    }
    if (!["true", "false"].includes(rawSuccess)) throw new TypeError(`JMeter CSV row ${rowIndex + 1} has an invalid success value; expected true or false.`);
    const threadsRaw = allThreadsIndex >= 0 ? values[allThreadsIndex] : "";
    const threads = threadsRaw === undefined || threadsRaw.trim() === "" ? null : Number(threadsRaw);
    if (threads !== null && (!Number.isInteger(threads) || threads < 0)) throw new TypeError(`JMeter CSV row ${rowIndex + 1} has an invalid allThreads value.`);
    samples.push({ timestamp, elapsed, success: rawSuccess === "true", label: labelIndex >= 0 ? values[labelIndex] || "" : "", allThreads: threads, responseCode: responseCodeIndex >= 0 ? values[responseCodeIndex] || "" : "" });
    if (samples.length > MAX_JMETER_SAMPLES) throw new RangeError(`JMeter import is limited to ${MAX_JMETER_SAMPLES.toLocaleString()} samples per file. Split the export into smaller test windows.`);
  }
  return samples;
}

function parseJMeterXml(source) {
  if (/<!\s*(DOCTYPE|ENTITY)\b/i.test(source)) throw new TypeError("JMeter XML containing a DOCTYPE or ENTITY declaration is not accepted.");
  const stripped = source.replace(/<!--[\s\S]*?-->/g, "").replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  if (!/<(?:[\w.-]+:)?testResults\b/i.test(stripped)) throw new TypeError("XML JTL should have a testResults root element.");
  const tokens = stripped.matchAll(/<\/?[A-Za-z_][\w:.-]*\b[^>]*>/g);
  const stack = [];
  const samples = [];
  for (const tokenMatch of tokens) {
    const token = tokenMatch[0];
    if (/^<\s*[!?]/.test(token)) continue;
    const closeMatch = token.match(/^<\/\s*([A-Za-z_][\w:.-]*)/);
    if (closeMatch) {
      let matchIndex = -1;
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].tag === closeMatch[1]) { matchIndex = i; break; }
      }
      if (matchIndex < 0) throw new TypeError(`Malformed JMeter XML: unexpected closing tag ${closeMatch[1]}.`);
      if (matchIndex !== stack.length - 1) throw new TypeError(`Malformed JMeter XML: closing tag ${closeMatch[1]} does not match the current element.`);
      const closed = stack[matchIndex];
      stack.length = matchIndex;
      if (closed.isSample && !closed.hasChildSample) samples.push(closed.attributes);
      continue;
    }
    const openMatch = token.match(/^<\s*([A-Za-z_][\w:.-]*)/);
    if (!openMatch) continue;
    const qualifiedTag = openMatch[1];
    const tag = qualifiedTag.split(":").pop();
    const isSample = JMETER_SAMPLE_TAGS.has(tag);
    if (isSample) {
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].isSample) { stack[i].hasChildSample = true; break; }
      }
    }
    const element = { tag: qualifiedTag, isSample, hasChildSample: false, attributes: parseXmlAttributes(token.slice(openMatch[0].length, token.length - 1)) };
    if (/\/\s*>$/.test(token)) {
      if (isSample) samples.push(element.attributes);
    } else stack.push(element);
    if (samples.length > MAX_JMETER_SAMPLES) throw new RangeError(`JMeter import is limited to ${MAX_JMETER_SAMPLES.toLocaleString()} samples per file. Split the export into smaller test windows.`);
  }
  if (stack.length !== 0) throw new TypeError("JMeter XML appears truncated or contains unclosed elements.");
  if (samples.length === 0) throw new TypeError("No raw sample elements were found in the JMeter XML JTL.");
  return samples.map((sample, index) => {
    const timestamp = Number(sample.ts ?? sample.timeStamp ?? sample.timestamp);
    const elapsed = Number(sample.t ?? sample.elapsed ?? sample.elapsedMs);
    const successRaw = String(sample.s ?? sample.success ?? "").toLowerCase();
    const allThreadsRaw = sample.na ?? sample.allThreads;
    const allThreads = allThreadsRaw === undefined || allThreadsRaw === "" ? null : Number(allThreadsRaw);
    if (!Number.isFinite(timestamp) || timestamp <= 0 || !Number.isFinite(elapsed) || elapsed < 0) throw new TypeError(`JMeter XML sample ${index + 1} has an invalid timestamp or elapsed time.`);
    if (!["true", "false"].includes(successRaw)) throw new TypeError(`JMeter XML sample ${index + 1} has an invalid success attribute; expected s="true" or s="false".`);
    if (allThreads !== null && (!Number.isInteger(allThreads) || allThreads < 0)) throw new TypeError(`JMeter XML sample ${index + 1} has an invalid active thread count.`);
    return { timestamp, elapsed, success: successRaw === "true", label: sample.lb ?? sample.label ?? "", allThreads, responseCode: sample.rc ?? sample.responseCode ?? "" };
  });
}

function percentileNearestRank(values, percentile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)];
}

export function parseJMeterLoadTestText(source, metadata = {}, format = "auto") {
  if (typeof source !== "string" || !source.trim()) throw new TypeError("Paste a JMeter sample-level CSV or XML JTL export first.");
  if (source.length > MAX_JMETER_IMPORT_CHARS) throw new RangeError(`JMeter import is limited to ${(MAX_JMETER_IMPORT_CHARS / 1024 / 1024).toFixed(0)} MB of text per file.`);
  const normalizedFormat = format === "auto" ? (/^\uFEFF?\s*</.test(source) ? "xml" : "csv") : format;
  if (!["csv", "xml"].includes(normalizedFormat)) throw new TypeError("Choose JMeter sample CSV or XML JTL format.");
  const name = String(metadata.name || "").trim();
  const testedAt = String(metadata.testedAt || "").trim();
  const targetEnvironment = String(metadata.targetEnvironment || "").trim();
  const offeredRps = parseOptionalNumber(metadata.offeredRps, "Offered load (req/s)", { min: 0.001, max: 100000000 });
  const durationSeconds = parseOptionalNumber(metadata.durationSeconds, "Test duration (seconds)", { min: 1, max: 604800 });
  if (!name) throw new TypeError("Enter the JMeter test name before importing.");
  if (!testedAt || !/^\d{4}-\d{2}-\d{2}$/.test(testedAt) || Number.isNaN(Date.parse(`${testedAt}T00:00:00Z`))) throw new TypeError("Enter the test date in YYYY-MM-DD format.");
  if (!targetEnvironment) throw new TypeError("Enter the target environment identifier before importing.");
  if (offeredRps === null) throw new TypeError("Enter the offered request rate explicitly. JMeter sample rows record completed samples, not all offered requests or dropped load-generator work.");
  if (durationSeconds === null) throw new TypeError("Enter the configured load-test duration in seconds; the first and last sample timestamps do not reliably identify the full test duration.");

  const samples = normalizedFormat === "xml" ? parseJMeterXml(source) : parseJMeterCsv(source);
  if (!samples.length) throw new TypeError("No JMeter sample rows were found.");
  const successCount = samples.reduce((sum, sample) => sum + (sample.success ? 1 : 0), 0);
  const failedCount = samples.length - successCount;
  const threadCounts = samples.map((sample) => sample.allThreads).filter(numeric);
  const p95LatencyMs = percentileNearestRank(samples.map((sample) => sample.elapsed), 0.95);
  const record = {
    name, testedAt, targetEnvironment,
    source: normalizedFormat === "xml" ? "Apache JMeter XML JTL" : "Apache JMeter sample CSV JTL",
    workload: {
      durationSeconds,
      offeredRps,
      concurrency: metadata.concurrency === "" || metadata.concurrency === null || metadata.concurrency === undefined
        ? (threadCounts.length ? threadCounts.reduce((maximum, value) => Math.max(maximum, value), 0) : null)
        : parseOptionalNumber(metadata.concurrency, "Concurrent threads / users", { min: 1, max: 100000000, integer: true }),
    },
    observed: {
      throughputRps: successCount / durationSeconds,
      p95LatencyMs,
      errorRatePercent: failedCount / samples.length * 100,
    },
    notes: `Imported from ${normalizedFormat === "xml" ? "JMeter XML JTL" : "JMeter sample CSV JTL"}: ${samples.length} sample rows, ${successCount} successful and ${failedCount} unsuccessful. Successful throughput is successful completed sample count divided by the explicitly supplied test duration. Offered RPS and configured duration were supplied as import metadata; they were not inferred from completed samples. ${String(metadata.notes || "").trim()}`.trim(),
  };
  return normalizeLoadTestRecord(record);
}

export function createLoadTestJsonTemplate() {
  return JSON.stringify({
    schemaVersion: LOAD_TEST_EVIDENCE_SCHEMA_VERSION,
    records: [{
      name: "",
      testedAt: "",
      targetEnvironment: "",
      source: "",
      workload: { durationSeconds: 60, offeredRps: null, concurrency: null },
      observed: {
        throughputRps: null,
        p95LatencyMs: null,
        errorRatePercent: null,
        appCpuPercent: null,
        appMemoryGb: null,
        dbCpuPercent: null,
        dbConnections: null,
        dbP95QueryMs: null,
        restExclusiveMeanServiceMs: null,
        restServiceSampleCount: null,
        dbMeanQueryServiceMs: null,
        dbServiceSampleCount: null,
      },
      notes: "",
    }],
  }, null, 2);
}

function groupOfferedLoadLevels(records) {
  const sorted = records.map((item) => item.workload.offeredRps).filter(numeric).sort((a, b) => a - b);
  const levels = [];
  for (const value of sorted) {
    const match = levels.find((level) => Math.abs(value - level.center) / Math.max(value, level.center, 0.001) <= 0.1);
    if (!match) levels.push({ center: value, values: [value] });
    else {
      match.values.push(value);
      match.center = match.values.reduce((sum, item) => sum + item, 0) / match.values.length;
    }
  }
  return levels;
}

export function assessLoadTestEvidence(records = []) {
  const normalized = [];
  const rejected = [];
  for (const record of Array.isArray(records) ? records : []) {
    try {
      const item = normalizeLoadTestRecord(record);
      normalized.push(item);
    } catch (error) {
      rejected.push({ id: record?.id || null, reason: error.message });
    }
  }
  const comparisonReady = normalized.filter((item) =>
    numeric(item.observed.throughputRps)
      && numeric(item.observed.p95LatencyMs)
      && numeric(item.observed.errorRatePercent));
  const byEnvironment = new Map();
  for (const item of comparisonReady) {
    if (!byEnvironment.has(item.targetEnvironment)) byEnvironment.set(item.targetEnvironment, []);
    byEnvironment.get(item.targetEnvironment).push(item);
  }
  const environmentAssessments = [...byEnvironment.entries()].map(([environment, group]) => ({
    environment,
    records: group,
    levels: groupOfferedLoadLevels(group),
  })).sort((a, b) => b.records.length - a.records.length || b.levels.length - a.levels.length || a.environment.localeCompare(b.environment));
  const best = environmentAssessments[0] || { environment: "", records: [], levels: [] };
  const readyGroup = environmentAssessments.find((item) => item.records.length >= 3 && item.levels.length >= 2) || null;
  const ready = Boolean(readyGroup);
  const chosen = readyGroup || best;
  return {
    recordCount: normalized.length,
    comparisonReadyCount: comparisonReady.length,
    workloadLevelCount: chosen.levels.length,
    workloadLevelsRps: chosen.levels.map((level) => Number(level.center.toFixed(2))),
    targetEnvironment: chosen.environment || null,
    readyForCrossLoadAssessment: ready,
    message: ready
      ? `${readyGroup.records.length} complete tests in environment '${readyGroup.environment}' span ${readyGroup.levels.length} offered-load levels. This is enough to assess model behavior across load levels, but it does not certify production accuracy.`
      : `Add at least 3 tests with throughput, p95 latency and error-rate measurements across at least 2 distinct offered-load levels for the same target environment. The best environment currently has ${best.records.length} complete test(s) across ${best.levels.length} load level(s).`,
    rejected,
  };
}

export function compareLoadTestToSimulation(simulationResult, record) {
  const measured = normalizeLoadTestRecord(record);
  const metrics = simulationResult?.metrics;
  const observationWindowMs = metrics?.observationWindowMs ?? simulationResult?.simulation?.durationMs;
  if (!isRecord(metrics) || !numeric(observationWindowMs) || observationWindowMs <= 0) {
    return { status: "unavailable", reason: "A completed simulation result with an observation window is required.", rows: [], workloadMatch: null };
  }
  const simulated = {
    offeredRps: metrics.offeredRequests / (observationWindowMs / 1000),
    durationSeconds: observationWindowMs / 1000,
    throughputRps: metrics.throughputRps,
    p95LatencyMs: metrics.successfulLatencyMs?.p95 ?? null,
    errorRatePercent: numeric(metrics.offeredRequests) && metrics.offeredRequests > 0
      ? ((metrics.failedRequests || 0) / metrics.offeredRequests) * 100
      : null,
    droppedRatePercent: numeric(metrics.offeredRequests) && metrics.offeredRequests > 0
      ? ((metrics.droppedRequests || 0) / metrics.offeredRequests) * 100
      : null,
  };
  const rows = [
    { key: "offeredRps", label: "Offered load", unit: "req/s", simulated: simulated.offeredRps, measured: measured.workload.offeredRps },
    { key: "durationSeconds", label: "Observation / test duration", unit: "s", simulated: simulated.durationSeconds, measured: measured.workload.durationSeconds },
    { key: "throughputRps", label: "Successful throughput", unit: "req/s", simulated: simulated.throughputRps, measured: measured.observed.throughputRps },
    { key: "p95LatencyMs", label: "Successful / end-to-end p95 latency", unit: "ms", simulated: simulated.p95LatencyMs, measured: measured.observed.p95LatencyMs },
    { key: "errorRatePercent", label: "Failed-request rate", unit: "%", simulated: simulated.errorRatePercent, measured: measured.observed.errorRatePercent },
    { key: "droppedRatePercent", label: "Simulator-only dropped-request rate", unit: "%", simulated: simulated.droppedRatePercent, measured: null },
  ].map((row) => ({ ...row, delta: numeric(row.simulated) && numeric(row.measured) ? row.simulated - row.measured : null,
    relativeDeltaPercent: numeric(row.simulated) && numeric(row.measured) && row.measured !== 0 ? ((row.simulated - row.measured) / Math.abs(row.measured)) * 100 : null }));
  const workloadDeltaPercent = Math.abs(simulated.offeredRps - measured.workload.offeredRps) / Math.max(simulated.offeredRps, measured.workload.offeredRps, 0.001) * 100;
  const durationDeltaPercent = Math.abs(simulated.durationSeconds - measured.workload.durationSeconds) / Math.max(simulated.durationSeconds, measured.workload.durationSeconds, 0.001) * 100;
  const needsCore = !numeric(measured.observed.throughputRps) || !numeric(measured.observed.p95LatencyMs) || !numeric(measured.observed.errorRatePercent);
  const status = needsCore ? "incomplete" : (workloadDeltaPercent > 10 || durationDeltaPercent > 25) ? "workload-mismatch" : "comparable";
  return {
    status,
    workloadDeltaPercent,
    durationDeltaPercent,
    workloadMatch: status === "comparable",
    rows,
    measuredContext: {
      appCpuPercent: measured.observed.appCpuPercent,
      appMemoryGb: measured.observed.appMemoryGb,
      dbCpuPercent: measured.observed.dbCpuPercent,
      dbConnections: measured.observed.dbConnections,
      dbP95QueryMs: measured.observed.dbP95QueryMs,
    },
    reason: needsCore
      ? "This record is missing throughput, p95 latency or failed-request rate, so the comparison is partial."
      : workloadDeltaPercent > 10 || durationDeltaPercent > 25
        ? `Comparison conditions differ: offered load delta ${workloadDeltaPercent.toFixed(1)}% (limit 10%); duration delta ${durationDeltaPercent.toFixed(1)}% (limit 25%). Align the workload and observation window before interpreting the metric differences.`
        : "Offered load is within 10% and test duration within 25%. Review metric definitions, environment topology, ramp-up, warm-up and resource contention before using differences to tune assumptions.",
  };
}

function weightedMean(records, valueKey, countKey) {
  let weightedSum = 0;
  let countSum = 0;
  for (const item of records) {
    const value = item.observed[valueKey];
    const samples = item.observed[countKey];
    if (!numeric(value) || !numeric(samples) || samples < 1) continue;
    weightedSum += value * samples;
    countSum += samples;
  }
  return { mean: countSum > 0 ? weightedSum / countSum : null, samples: countSum };
}

/**
 * Offer reviewable mean-service-time changes only with repeated component-level
 * measurements for the same named environment over multiple offered-load levels.
 * Aggregate end-to-end latency alone is never used to infer component service time.
 */
export function proposeServiceTimeCalibrations(records = [], workbench, simulationProfile) {
  const entities = Array.isArray(workbench?.entities) ? workbench.entities : [];
  const result = [];
  const kinds = [
    { entityKind: "backend.rest-service", valueKey: "restExclusiveMeanServiceMs", countKey: "restServiceSampleCount", label: "REST exclusive mean service time" },
    { entityKind: "data.postgresql-database", valueKey: "dbMeanQueryServiceMs", countKey: "dbServiceSampleCount", label: "PostgreSQL mean query execution time" },
  ];
  for (const kind of kinds) {
    const eligible = [];
    for (const raw of Array.isArray(records) ? records : []) {
      try {
        const record = normalizeLoadTestRecord(raw);
        if (numeric(record.observed[kind.valueKey]) && numeric(record.observed[kind.countKey])) eligible.push(record);
      } catch { /* Ignore invalid records; evidence assessment reports incomplete data separately. */ }
    }
    const environmentGroups = new Map();
    for (const record of eligible) {
      const key = record.targetEnvironment;
      if (!environmentGroups.has(key)) environmentGroups.set(key, []);
      environmentGroups.get(key).push(record);
    }
    const qualifyingGroup = [...environmentGroups.entries()]
      .map(([environment, group]) => ({ environment, group, levels: groupOfferedLoadLevels(group) }))
      .filter((item) => item.group.length >= 3 && item.levels.length >= 2)
      .sort((a, b) => b.group.length - a.group.length || a.environment.localeCompare(b.environment))[0];
    if (!qualifyingGroup) continue;
    const measurements = weightedMean(qualifyingGroup.group, kind.valueKey, kind.countKey);
    if (!numeric(measurements.mean) || measurements.mean <= 0) continue;
    for (const entity of entities.filter((item) => item.kind === kind.entityKind)) {
      const current = simulationProfile?.profilesByEntityId?.[entity.id]?.parameters?.meanServiceMs;
      if (!numeric(current) || current <= 0) continue;
      result.push({
        entityId: entity.id,
        entityName: entity.name || entity.id,
        entityKind: kind.entityKind,
        field: "meanServiceMs",
        label: kind.label,
        environment: qualifyingGroup.environment,
        currentValue: current,
        proposedValue: Number(measurements.mean.toFixed(3)),
        sampleCount: measurements.samples,
        testCount: qualifyingGroup.group.length,
        workloadLevelsRps: qualifyingGroup.levels.map((level) => Number(level.center.toFixed(2))),
        changed: Math.abs(current - measurements.mean) > Math.max(0.05, current * 0.01),
        evidenceRecordIds: qualifyingGroup.group.map((item) => item.id),
        note: kind.entityKind === "backend.rest-service"
          ? "Use exclusive server-side processing time, excluding queue wait, database/network wait and downstream service time; otherwise REST and database work may be double-counted."
          : "Use mean query execution/service time, excluding connection-pool wait and queue/lock wait unless the simulation model is explicitly extended to represent those waits.",
      });
    }
  }
  return result;
}
