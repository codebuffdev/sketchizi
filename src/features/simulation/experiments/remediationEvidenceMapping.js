import { normalizeRemediationMeasurements, getRemediationAcceptanceMetricDefinitions } from "./remediationAcceptanceCriteria.js";
import { LOAD_TEST_EVIDENCE_SCHEMA_VERSION, LOAD_TEST_MEASUREMENT_FIELDS } from "./loadTestCalibration.js";

const SOURCE_TYPES = new Set(["load-test-record", "report-field", "evidence-reference"]);
const METRICS = getRemediationAcceptanceMetricDefinitions();
const METRIC_BY_KEY = new Map(METRICS.map((metric) => [metric.key, metric]));
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const safeText = (value, max = 600) => String(value ?? "").trim().slice(0, max);
const numeric = (value, metricKey) => {
  if (value === "" || value === null || value === undefined) return null;
  const number = typeof value === "number" ? value : Number(value);
  const definition = METRIC_BY_KEY.get(metricKey);
  return definition && Number.isFinite(number) && number >= definition.min && number <= definition.max ? number : null;
};

export const REMEDIATION_MEASUREMENT_SOURCE_OPTIONS = Object.freeze([
  { value: "load-test-record", label: "Saved load-test record" },
  { value: "report-field", label: "Report field" },
  { value: "evidence-reference", label: "Evidence reference" },
]);

/** Resolve the source field represented by a saved load-test record for a remediation metric. */
export function getLoadTestSourceMetric(record, metricKey) {
  if (!isRecord(record) || !METRIC_BY_KEY.has(metricKey)) return null;
  const observed = isRecord(record.observed) ? record.observed : {};
  if (metricKey === "successRatePercent") {
    const errorRate = numeric(observed.errorRatePercent, "errorRatePercent");
    return errorRate === null ? null : {
      value: Math.round((100 - errorRate) * 1e6) / 1e6,
      fieldPath: "observed.errorRatePercent",
      transformation: "100 - observed.errorRatePercent",
    };
  }
  const value = numeric(observed[metricKey], metricKey);
  return value === null ? null : { value, fieldPath: `observed.${metricKey}`, transformation: "" };
}

function normalizeSourceItem(value, metricKey) {
  const input = isRecord(value) ? value : {};
  const sourceType = SOURCE_TYPES.has(input.sourceType) ? input.sourceType : "";
  const sourceValue = numeric(input.sourceValue, metricKey);
  const evidenceClassification = sourceType === "load-test-record"
    ? "user-supplied-load-test-record-field"
    : sourceType === "report-field" ? "user-supplied-report-field-mapping"
      : sourceType === "evidence-reference" ? "user-supplied-evidence-field-mapping" : "unmapped";
  return {
    sourceType,
    sourceRecordId: bounded(sourceType === "load-test-record" ? input.sourceRecordId : "", 140),
    sourceName: bounded(input.sourceName, 180),
    sourceTestedAt: bounded(input.sourceTestedAt, 40),
    sourceEnvironment: bounded(input.sourceEnvironment, 180),
    sourceTool: bounded(input.sourceTool, 120),
    sourceField: bounded(input.sourceField, 240),
    evidenceReference: bounded(input.evidenceReference, 1200),
    sourceValue,
    transformation: bounded(input.transformation, 180),
    sourceSnapshot: normalizeLoadTestSourceSnapshot(input.sourceSnapshot),
    evidenceClassification,
    independentlyVerified: false,
  };
}
function bounded(value, maxLength) { return String(value ?? "").trim().slice(0, maxLength); }

function normalizeFiniteOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeLoadTestFieldDefinition(value) {
  if (!isRecord(value) || !bounded(value.key, 120)) return null;
  return {
    key: bounded(value.key, 120),
    label: bounded(value.label, 180),
    min: normalizeFiniteOrNull(value.min),
    max: normalizeFiniteOrNull(value.max),
    step: normalizeFiniteOrNull(value.step),
    group: bounded(value.group, 60),
  };
}

function normalizeLoadTestSourceSnapshot(value) {
  if (!isRecord(value)) return null;
  const recordMetadata = isRecord(value.recordMetadata) ? value.recordMetadata : {};
  const workload = isRecord(value.workload) ? value.workload : {};
  const schemaVersion = Number.isSafeInteger(value.schemaVersion) && value.schemaVersion >= 0 ? value.schemaVersion : null;
  const snapshot = {
    schemaVersion,
    recordId: bounded(value.recordId, 140),
    recordMetadata: {
      name: bounded(recordMetadata.name, 180),
      testedAt: bounded(recordMetadata.testedAt, 40),
      targetEnvironment: bounded(recordMetadata.targetEnvironment, 180),
      source: bounded(recordMetadata.source, 120),
    },
    workload: {
      durationSeconds: normalizeFiniteOrNull(workload.durationSeconds),
      offeredRps: normalizeFiniteOrNull(workload.offeredRps),
      concurrency: normalizeFiniteOrNull(workload.concurrency),
    },
    fieldDefinition: normalizeLoadTestFieldDefinition(value.fieldDefinition),
    fieldPresent: value.fieldPresent === true,
    sourceField: bounded(value.sourceField, 240),
    sourceValue: normalizeFiniteOrNull(value.sourceValue),
    transformation: bounded(value.transformation, 180),
  };
  return snapshot;
}

function buildLoadTestSourceSnapshot(record, metricKey, resolved) {
  if (!isRecord(record)) return null;
  const sourceFieldKey = bounded(resolved?.fieldPath, 240).split(".").at(-1) || "";
  const fieldDefinition = LOAD_TEST_MEASUREMENT_FIELDS.find((field) => field.key === sourceFieldKey);
  const observed = isRecord(record.observed) ? record.observed : {};
  const workload = isRecord(record.workload) ? record.workload : {};
  return normalizeLoadTestSourceSnapshot({
    schemaVersion: record.schemaVersion ?? LOAD_TEST_EVIDENCE_SCHEMA_VERSION,
    recordId: record.id,
    recordMetadata: {
      name: record.name,
      testedAt: record.testedAt,
      targetEnvironment: record.targetEnvironment,
      source: record.source,
    },
    workload: {
      durationSeconds: workload.durationSeconds,
      offeredRps: workload.offeredRps,
      concurrency: workload.concurrency,
    },
    fieldDefinition,
    fieldPresent: Boolean(sourceFieldKey && Object.hasOwn(observed, sourceFieldKey)),
    sourceField: resolved?.fieldPath || "",
    sourceValue: resolved?.value ?? null,
    transformation: resolved?.transformation || "",
    metricKey,
  });
}

function sameFiniteOrNull(left, right) {
  return left === null || left === undefined ? right === null || right === undefined : right === left;
}

function sameFieldDefinition(left, right) {
  if (!left || !right) return false;
  return ["key", "label", "min", "max", "step", "group"].every((key) => sameFiniteOrNull(left[key], right[key]));
}

/** Normalize saved source links without ever treating their presence as independent verification. */
export function normalizeRemediationMeasurementSources(value) {
  const input = isRecord(value) ? value : {};
  return Object.fromEntries(METRICS.map((metric) => {
    const row = isRecord(input[metric.key]) ? input[metric.key] : {};
    return [metric.key, {
      before: normalizeSourceItem(row.before, metric.key),
      after: normalizeSourceItem(row.after, metric.key),
    }];
  }));
}

/** Snapshot a source link at run-recording time. Load-test values are resolved from the selected record, not typed twice. */
export function captureRemediationMeasurementSources(value, measurementsValue, loadTestRecords = []) {
  const input = isRecord(value) ? value : {};
  const recordsById = new Map((Array.isArray(loadTestRecords) ? loadTestRecords : [])
    .filter(isRecord).map((record) => [String(record.id || ""), record]));
  const sourceInput = {};
  for (const metric of METRICS) {
    const row = isRecord(input[metric.key]) ? input[metric.key] : {};
    sourceInput[metric.key] = {};
    for (const side of ["before", "after"]) {
      const raw = isRecord(row[side]) ? row[side] : {};
      if (raw.sourceType === "load-test-record") {
        const record = recordsById.get(String(raw.sourceRecordId || ""));
        const resolved = getLoadTestSourceMetric(record, metric.key);
        sourceInput[metric.key][side] = {
          sourceType: raw.sourceType,
          sourceRecordId: record?.id || raw.sourceRecordId,
          sourceName: record?.name || "",
          sourceTestedAt: record?.testedAt || "",
          sourceEnvironment: record?.targetEnvironment || "",
          sourceTool: record?.source || "",
          sourceField: resolved?.fieldPath || "",
          evidenceReference: record ? `Load-test record ${record.id}` : "",
          sourceValue: resolved?.value ?? null,
          transformation: resolved?.transformation || "",
          sourceSnapshot: buildLoadTestSourceSnapshot(record, metric.key, resolved),
        };
      } else {
        sourceInput[metric.key][side] = {
          sourceType: raw.sourceType,
          evidenceReference: raw.evidenceReference || raw.sourceReference,
          sourceField: raw.sourceField,
          sourceValue: raw.sourceValue,
        };
      }
    }
  }
  const normalizedSources = normalizeRemediationMeasurementSources(sourceInput);
  return { sources: normalizedSources, evaluation: evaluateRemediationMeasurementSources(measurementsValue, normalizedSources) };
}

function valuesMatch(left, right) {
  if (typeof left !== "number" || typeof right !== "number") return false;
  return Math.abs(left - right) <= Math.max(1e-6, Math.abs(right) * 1e-9);
}

/**
 * Compare immutable load-test source snapshots on verification runs with the currently attached
 * load-test records. This is a local consistency check, not source authentication. Older snapshots
 * remain reviewable but are marked incomplete when field-definition/workload baselines are absent.
 */
export function evaluateRemediationMeasurementSourceDrift(sourcesValue, loadTestRecords) {
  if (!Array.isArray(loadTestRecords)) {
    return {
      status: "not-evaluated", sourceCount: 0, unchangedCount: 0, changedCount: 0,
      missingSourceCount: 0, changedValueCount: 0, changedFieldDefinitionCount: 0,
      changedMetadataCount: 0, changedWorkloadCount: 0, snapshotIncompleteCount: 0,
      items: [], independentlyVerified: false,
      reason: "Current load-test records were not supplied, so source drift has not been evaluated.",
    };
  }
  const sources = normalizeRemediationMeasurementSources(sourcesValue);
  const recordsById = new Map(loadTestRecords.filter(isRecord).map((record) => [String(record.id || ""), record]));
  const items = [];
  for (const metric of METRICS) {
    for (const side of ["before", "after"]) {
      const source = sources[metric.key][side];
      if (source.sourceType !== "load-test-record" || !source.sourceRecordId) continue;
      const snapshot = source.sourceSnapshot;
      const current = recordsById.get(source.sourceRecordId);
      const changes = [];
      let state = "unchanged";
      let currentSource = null;
      if (!current) {
        state = "missing-source";
        changes.push({ type: "source-record-missing", label: "Source record missing", detail: `Load-test record '${source.sourceRecordId}' is not attached to the current profile.` });
      } else {
        currentSource = getLoadTestSourceMetric(current, metric.key);
        const currentSourceField = currentSource?.fieldPath || "";
        const sourceFieldKey = currentSourceField.split(".").at(-1) || "";
        const currentFieldDefinition = LOAD_TEST_MEASUREMENT_FIELDS.find((field) => field.key === sourceFieldKey);
        const currentObserved = isRecord(current.observed) ? current.observed : {};
        const currentWorkload = isRecord(current.workload) ? current.workload : {};
        const legacyFieldKey = source.sourceField.split(".").at(-1) || "";
        const legacyFieldDefinition = LOAD_TEST_MEASUREMENT_FIELDS.find((field) => field.key === legacyFieldKey);
        const savedFieldDefinition = snapshot?.fieldDefinition || null;
        const fieldKeyForPresence = (snapshot?.sourceField || source.sourceField).split(".").at(-1) || "";
        const currentFieldPresent = Boolean(sourceFieldKey && Object.hasOwn(currentObserved, sourceFieldKey));
        const savedFieldPresent = snapshot ? snapshot.fieldPresent : Boolean(source.sourceField);
        if (snapshot && (snapshot.schemaVersion !== (Number.isSafeInteger(current.schemaVersion) ? current.schemaVersion : LOAD_TEST_EVIDENCE_SCHEMA_VERSION)
          || snapshot.sourceField !== currentSourceField
          || snapshot.transformation !== (currentSource?.transformation || "")
          || (savedFieldDefinition && !sameFieldDefinition(savedFieldDefinition, normalizeLoadTestFieldDefinition(currentFieldDefinition)))
          || savedFieldPresent !== currentFieldPresent
          || (!savedFieldDefinition && currentFieldDefinition))) {
          changes.push({
            type: "field-definition-changed", label: "Field definition changed",
            detail: `The saved field definition (${snapshot.sourceField || "missing"}; schema ${snapshot.schemaVersion ?? "unknown"}) differs from the current mapping (${currentSourceField || "unavailable"}; schema ${current.schemaVersion ?? LOAD_TEST_EVIDENCE_SCHEMA_VERSION}).`,
          });
        } else if (!snapshot && (!legacyFieldDefinition || !currentFieldDefinition || legacyFieldKey !== sourceFieldKey)) {
          changes.push({ type: "field-definition-changed", label: "Field definition changed", detail: `The saved field ${source.sourceField || "(missing)"} no longer matches the current source field ${currentSourceField || "(unavailable)"}.` });
        }
        const baselineValue = snapshot?.sourceValue ?? source.sourceValue;
        const currentValue = currentSource?.value ?? null;
        if (baselineValue === null || currentValue === null ? baselineValue !== currentValue : !valuesMatch(baselineValue, currentValue)) {
          changes.push({ type: "value-changed", label: "Source value changed", baselineValue, currentValue,
            detail: `The saved numeric source value was ${baselineValue ?? "unavailable"}; the current source value is ${currentValue ?? "unavailable"}.` });
        }
        const baselineMetadata = snapshot?.recordMetadata || {
          name: source.sourceName, testedAt: source.sourceTestedAt,
          targetEnvironment: source.sourceEnvironment, source: source.sourceTool,
        };
        const currentMetadata = {
          name: bounded(current.name, 180), testedAt: bounded(current.testedAt, 40),
          targetEnvironment: bounded(current.targetEnvironment, 180), source: bounded(current.source, 120),
        };
        const changedMetadataFields = Object.keys(currentMetadata).filter((field) => String(baselineMetadata[field] ?? "") !== currentMetadata[field]);
        if (changedMetadataFields.length) {
          changes.push({ type: "metadata-changed", label: "Source metadata changed", fields: changedMetadataFields,
            detail: `Source record metadata changed: ${changedMetadataFields.join(", ")}.` });
        }
        if (snapshot) {
          const currentWorkloadSnapshot = {
            durationSeconds: normalizeFiniteOrNull(currentWorkload.durationSeconds),
            offeredRps: normalizeFiniteOrNull(currentWorkload.offeredRps),
            concurrency: normalizeFiniteOrNull(currentWorkload.concurrency),
          };
          const changedWorkloadFields = Object.keys(currentWorkloadSnapshot).filter((field) => !sameFiniteOrNull(snapshot.workload[field], currentWorkloadSnapshot[field]));
          if (changedWorkloadFields.length) {
            changes.push({ type: "workload-changed", label: "Workload definition changed", fields: changedWorkloadFields,
              detail: `Workload inputs changed: ${changedWorkloadFields.join(", ")}.` });
          }
        }
        if (!snapshot || !savedFieldDefinition || !snapshot.recordMetadata || !snapshot.workload) {
          changes.push({ type: "snapshot-incomplete", label: "Original snapshot is incomplete", detail: "This saved mapping predates the full source-drift snapshot. Current value and metadata comparisons are possible, but not every field-definition/workload change can be proven absent." });
        }
        if (changes.some((change) => change.type !== "snapshot-incomplete")) state = "changed";
        else if (changes.some((change) => change.type === "snapshot-incomplete")) state = "snapshot-incomplete";
      }
      const originalSnapshot = snapshot || normalizeLoadTestSourceSnapshot({
        schemaVersion: null,
        recordId: source.sourceRecordId,
        recordMetadata: { name: source.sourceName, testedAt: source.sourceTestedAt, targetEnvironment: source.sourceEnvironment, source: source.sourceTool },
        workload: {},
        fieldDefinition: null,
        fieldPresent: Boolean(source.sourceField),
        sourceField: source.sourceField,
        sourceValue: source.sourceValue,
        transformation: source.transformation,
      });
      const currentSnapshot = current ? buildLoadTestSourceSnapshot(current, metric.key, currentSource) : null;
      items.push({
        metricKey: metric.key, metricLabel: metric.label, side, sourceRecordId: source.sourceRecordId,
        sourceName: source.sourceName, sourceField: source.sourceField, savedValue: source.sourceValue,
        currentValue: currentSource?.value ?? null, originalSnapshot, currentSnapshot,
        state, changes, independentlyVerified: false,
      });
    }
  }
  const missingSourceCount = items.filter((item) => item.state === "missing-source").length;
  const changedCount = items.filter((item) => item.state === "changed").length;
  const unchangedCount = items.filter((item) => item.state === "unchanged").length;
  const changedValueCount = items.filter((item) => item.changes.some((change) => change.type === "value-changed")).length;
  const changedFieldDefinitionCount = items.filter((item) => item.changes.some((change) => change.type === "field-definition-changed")).length;
  const changedMetadataCount = items.filter((item) => item.changes.some((change) => change.type === "metadata-changed")).length;
  const changedWorkloadCount = items.filter((item) => item.changes.some((change) => change.type === "workload-changed")).length;
  const snapshotIncompleteCount = items.filter((item) => item.changes.some((change) => change.type === "snapshot-incomplete")).length;
  const status = items.length === 0 ? "not-applicable"
    : missingSourceCount || changedCount ? "drift-detected"
      : snapshotIncompleteCount ? "snapshot-incomplete" : "unchanged";
  return {
    status, sourceCount: items.length, unchangedCount, changedCount, missingSourceCount,
    changedValueCount, changedFieldDefinitionCount, changedMetadataCount, changedWorkloadCount,
    snapshotIncompleteCount, items, independentlyVerified: false,
    reason: status === "not-applicable" ? "No saved load-test source mappings are attached to these measurements."
      : status === "unchanged" ? `All ${unchangedCount} source mapping(s) match the attached load-test record snapshots.`
        : status === "snapshot-incomplete" ? `${snapshotIncompleteCount} source mapping(s) need a complete original snapshot before unchanged status can be established.`
          : `${changedCount + missingSourceCount} source mapping(s) show drift: ${missingSourceCount} missing, ${changedValueCount} value change(s), ${changedFieldDefinitionCount} field-definition change(s), ${changedMetadataCount} metadata change(s), and ${changedWorkloadCount} workload change(s).`,
  };
}

/** Recompute traceability state against the saved numeric values, not the stored summary. */
export function evaluateRemediationMeasurementSources(measurementsValue, sourcesValue, options = {}) {
  const measurements = normalizeRemediationMeasurements(measurementsValue);
  const sources = normalizeRemediationMeasurementSources(sourcesValue);
  const checkCatalog = Object.hasOwn(options, "loadTestRecords");
  const records = Array.isArray(options.loadTestRecords) ? options.loadTestRecords : [];
  const recordsById = new Map(records.filter(isRecord).map((record) => [String(record.id || ""), record]));
  const items = [];
  for (const metric of METRICS) {
    for (const side of ["before", "after"]) {
      const measurement = measurements[metric.key][side];
      const source = sources[metric.key][side];
      let state;
      let detail = "";
      if (measurement === null && !source.sourceType) {
        state = "not-applicable";
        detail = "No numeric measurement was supplied for this side.";
      } else if (measurement === null && source.sourceType) {
        state = "orphaned";
        detail = "A source is mapped, but the corresponding numeric measurement is missing.";
      } else if (!source.sourceType) {
        state = "unlinked";
        detail = "No originating load-test record, report field, or evidence field is linked.";
      } else if (!source.sourceField || source.sourceValue === null
        || (source.sourceType !== "load-test-record" && !source.evidenceReference)
        || (source.sourceType === "load-test-record" && !source.sourceRecordId)) {
        state = "incomplete";
        detail = "The source mapping needs a field path, numeric source value, and required source identifier/reference.";
      } else if (!valuesMatch(source.sourceValue, measurement)) {
        state = "mismatch";
        detail = `Mapped source value ${source.sourceValue} does not match recorded measurement ${measurement}.`;
      } else if (source.sourceType === "load-test-record" && checkCatalog) {
        const currentRecord = recordsById.get(source.sourceRecordId);
        if (!currentRecord) {
          state = "source-not-included";
          detail = `Load-test record '${source.sourceRecordId}' is not included in this release bundle; source value cannot be checked against the included record inventory.`;
        } else {
          const currentSource = getLoadTestSourceMetric(currentRecord, metric.key);
          if (!currentSource || currentSource.fieldPath !== source.sourceField || !valuesMatch(currentSource.value, source.sourceValue)) {
            state = "source-changed";
            detail = `The included load-test record no longer matches the saved source field/value (${source.sourceField} = ${source.sourceValue}).`;
          } else {
            state = "linked";
            detail = "Saved source field, included record and numeric measurement agree.";
          }
        }
      } else {
        state = "linked";
        detail = source.sourceType === "load-test-record"
          ? "Saved load-test field value matches the numeric measurement; source authenticity is not independently verified."
          : "The cited field value matches the numeric measurement; external reference contents are not fetched or independently verified.";
      }
      items.push({
        key: metric.key, metricLabel: metric.label, unit: metric.unit, side, measurement,
        sourceType: source.sourceType || "unmapped", sourceRecordId: source.sourceRecordId,
        sourceName: source.sourceName, sourceField: source.sourceField,
        evidenceReference: source.evidenceReference, sourceValue: source.sourceValue,
        evidenceClassification: source.evidenceClassification, independentlyVerified: false,
        state, detail,
      });
    }
  }
  const relevant = items.filter((item) => item.measurement !== null || item.state === "orphaned");
  const linkedCount = relevant.filter((item) => item.state === "linked").length;
  const unlinkedCount = relevant.filter((item) => item.state === "unlinked").length;
  const incompleteCount = relevant.filter((item) => ["incomplete", "source-not-included"].includes(item.state)).length;
  const mismatchCount = relevant.filter((item) => ["mismatch", "source-changed", "orphaned"].includes(item.state)).length;
  const status = relevant.length === 0 ? "no-measurements"
    : mismatchCount ? "inconsistent"
      : unlinkedCount || incompleteCount ? "incomplete"
        : linkedCount === relevant.length ? "complete" : "incomplete";
  return {
    status,
    measurementCount: relevant.length,
    linkedCount,
    unlinkedCount,
    incompleteCount,
    mismatchCount,
    items,
    sourceDrift: checkCatalog ? evaluateRemediationMeasurementSourceDrift(sources, records) : null,
    reason: status === "no-measurements" ? "No numeric measurements were supplied, so no metric-source mappings are required."
      : status === "complete" ? `All ${linkedCount} supplied numeric measurement(s) have a matching source field/value mapping.`
        : status === "inconsistent" ? `${mismatchCount} measurement source mapping(s) are inconsistent with the saved numeric values.`
          : `${unlinkedCount + incompleteCount} numeric measurement source mapping(s) are missing or incomplete.`,
    independentlyVerified: false,
  };
}

export function buildDefaultMeasurementSourceDraft(measurementSources = {}) {
  const normalized = normalizeRemediationMeasurementSources(measurementSources);
  return Object.fromEntries(METRICS.map((metric) => [metric.key, Object.fromEntries(["before", "after"].map((side) => {
    const source = normalized[metric.key][side];
    return [side, {
      sourceType: source.sourceType,
      sourceRecordId: source.sourceRecordId,
      evidenceReference: source.evidenceReference,
      sourceField: source.sourceField,
      sourceValue: source.sourceValue ?? "",
    }];
  }))]));
}

/** Keep persisted decision records bounded; detailed source states are recalculated on demand. */
export function summarizeRemediationMeasurementSourceEvaluation(evaluationValue) {
  const evaluation = isRecord(evaluationValue) ? evaluationValue : {};
  return {
    status: ["complete", "incomplete", "inconsistent", "no-measurements"].includes(evaluation.status) ? evaluation.status : "incomplete",
    measurementCount: Number.isSafeInteger(evaluation.measurementCount) ? Math.max(0, evaluation.measurementCount) : 0,
    linkedCount: Number.isSafeInteger(evaluation.linkedCount) ? Math.max(0, evaluation.linkedCount) : 0,
    unlinkedCount: Number.isSafeInteger(evaluation.unlinkedCount) ? Math.max(0, evaluation.unlinkedCount) : 0,
    incompleteCount: Number.isSafeInteger(evaluation.incompleteCount) ? Math.max(0, evaluation.incompleteCount) : 0,
    mismatchCount: Number.isSafeInteger(evaluation.mismatchCount) ? Math.max(0, evaluation.mismatchCount) : 0,
    reason: safeText(evaluation.reason, 500),
    independentlyVerified: false,
  };
}
