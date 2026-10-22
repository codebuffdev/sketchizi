const METRIC_DEFINITIONS = Object.freeze([
  { key: "p95LatencyMs", label: "p95 latency", unit: "ms", direction: "max", min: 0, max: Number.POSITIVE_INFINITY },
  { key: "throughputRps", label: "Throughput", unit: "req/s", direction: "min", min: 0, max: Number.POSITIVE_INFINITY },
  { key: "errorRatePercent", label: "Error rate", unit: "%", direction: "max", min: 0, max: 100 },
  { key: "successRatePercent", label: "Success rate", unit: "%", direction: "min", min: 0, max: 100 },
]);

const DEFINITION_BY_KEY = new Map(METRIC_DEFINITIONS.map((metric) => [metric.key, metric]));
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function parseMetricValue(value, definition) {
  if (value === "" || value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  if (typeof value !== "number" && typeof value !== "string") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < definition.min || number > definition.max) return null;
  return number;
}

/** Normalize known numeric acceptance targets; unknown keys and invalid values are discarded. */
export function normalizeRemediationAcceptanceCriteria(value) {
  if (!isRecord(value)) return {};
  const result = {};
  for (const definition of METRIC_DEFINITIONS) {
    const target = parseMetricValue(value[definition.key], definition);
    if (target !== null) result[definition.key] = target;
  }
  return result;
}

/** Validate user-entered targets and return a normalized, bounded object. */
export function validateRemediationAcceptanceCriteria(value) {
  if (!isRecord(value)) throw new TypeError("Acceptance criteria must be an object.");
  const result = {};
  for (const definition of METRIC_DEFINITIONS) {
    if (!Object.hasOwn(value, definition.key) || value[definition.key] === "" || value[definition.key] === null || value[definition.key] === undefined) continue;
    const target = parseMetricValue(value[definition.key], definition);
    if (target === null) {
      const range = Number.isFinite(definition.max) ? `${definition.min} to ${definition.max}` : `at least ${definition.min}`;
      throw new Error(`Enter a valid ${definition.label} target (${range} ${definition.unit}).`);
    }
    result[definition.key] = target;
  }
  const unknown = Object.keys(value).filter((key) => !DEFINITION_BY_KEY.has(key) && value[key] !== "" && value[key] !== null && value[key] !== undefined);
  if (unknown.length) throw new Error(`Unsupported acceptance metric: ${unknown[0]}.`);
  return result;
}

/** Normalize the before/after metric measurements attached to a verification run. */
export function normalizeRemediationMeasurements(value) {
  const source = isRecord(value) ? value : {};
  const result = {};
  for (const definition of METRIC_DEFINITIONS) {
    const values = isRecord(source[definition.key]) ? source[definition.key] : {};
    result[definition.key] = {
      before: parseMetricValue(values.before, definition),
      after: parseMetricValue(values.after, definition),
    };
  }
  return result;
}

export function validateRemediationMeasurements(value) {
  if (!isRecord(value)) throw new TypeError("Numeric before/after measurements must be an object.");
  for (const [key, rawPair] of Object.entries(value)) {
    const definition = DEFINITION_BY_KEY.get(key);
    if (!definition) throw new Error(`Unsupported measurement metric: ${key}.`);
    if (!isRecord(rawPair)) throw new Error(`Measurements for ${definition.label} must include before and after values.`);
    for (const field of ["before", "after"]) {
      const raw = rawPair[field];
      if (raw === "" || raw === null || raw === undefined) continue;
      if (parseMetricValue(raw, definition) === null) {
        const range = Number.isFinite(definition.max) ? `${definition.min} to ${definition.max}` : `at least ${definition.min}`;
        throw new Error(`Enter a valid ${field} ${definition.label} measurement (${range} ${definition.unit}).`);
      }
    }
  }
  return normalizeRemediationMeasurements(value);
}

export function acceptanceCriteriaEqual(left, right) {
  const normalizedLeft = normalizeRemediationAcceptanceCriteria(left);
  const normalizedRight = normalizeRemediationAcceptanceCriteria(right);
  return METRIC_DEFINITIONS.every((definition) => normalizedLeft[definition.key] === normalizedRight[definition.key]);
}

/** Compare the latest after-measurements with each configured target; absent values remain unevaluated. */
export function evaluateRemediationAcceptanceCriteria(criteriaValue, measurementsValue) {
  const criteria = normalizeRemediationAcceptanceCriteria(criteriaValue);
  const measurements = normalizeRemediationMeasurements(measurementsValue);
  const active = METRIC_DEFINITIONS.filter((definition) => Object.hasOwn(criteria, definition.key));
  if (!active.length) {
    return { status: "not-configured", criteriaCount: 0, evaluatedCount: 0, passedCount: 0, failedCount: 0, unevaluatedCount: 0, criteria: [], reason: "No quantitative acceptance targets are configured." };
  }
  const evaluated = active.map((definition) => {
    const target = criteria[definition.key];
    const { before, after } = measurements[definition.key];
    const state = after === null ? "unevaluated" : (definition.direction === "max" ? after <= target : after >= target) ? "pass" : "fail";
    const deltaRaw = before !== null && after !== null ? after - before : null;
    const delta = deltaRaw === null ? null : Math.round(deltaRaw * 1e6) / 1e6;
    return {
      key: definition.key, label: definition.label, unit: definition.unit, direction: definition.direction,
      comparator: definition.direction === "max" ? "at most" : "at least", target, before, after, delta, state,
      summary: state === "unevaluated"
        ? `No valid after-remediation ${definition.label} measurement was supplied.`
        : state === "pass"
          ? `After-remediation ${definition.label} ${after} ${definition.unit} meets the target of ${definition.direction === "max" ? "≤" : "≥"} ${target} ${definition.unit}.`
          : `After-remediation ${definition.label} ${after} ${definition.unit} misses the target of ${definition.direction === "max" ? "≤" : "≥"} ${target} ${definition.unit}.`,
    };
  });
  const passedCount = evaluated.filter((entry) => entry.state === "pass").length;
  const failedCount = evaluated.filter((entry) => entry.state === "fail").length;
  const unevaluatedCount = evaluated.filter((entry) => entry.state === "unevaluated").length;
  const status = failedCount ? "fail" : unevaluatedCount ? (passedCount ? "incomplete" : "unevaluated") : "pass";
  return {
    status, criteriaCount: active.length, evaluatedCount: passedCount + failedCount, passedCount, failedCount, unevaluatedCount,
    criteria: evaluated,
    reason: status === "pass" ? "All configured quantitative acceptance criteria pass."
      : status === "fail" ? `${failedCount} quantitative acceptance criterion/criteria fail.`
        : status === "incomplete" ? `${unevaluatedCount} quantitative acceptance criterion/criteria remain unevaluated.`
          : "No configured quantitative acceptance criterion could be evaluated.",
  };
}

export function getRemediationAcceptanceMetricDefinitions() {
  return METRIC_DEFINITIONS.map((definition) => ({ ...definition }));
}
