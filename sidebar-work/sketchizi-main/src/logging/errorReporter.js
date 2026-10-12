const reportedErrors = typeof WeakSet === "function" ? new WeakSet() : null;
let reporter = null;

const errorKeyPattern = /(password|passwd|token|jwt|api[-_]?key|secret|cookie|authorization|auth[-_]?header|private[-_]?key)/i;
const privateDataKeyPattern = /^(document|scene|elements|files|snapshot|request|response|user|participants|message)$/i;

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name || "Error",
      message: error.message || String(error),
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  if (error && typeof error === "object") {
    return {
      name: typeof error.name === "string" ? error.name : "Error",
      message: typeof error.message === "string" ? error.message : String(error),
      ...(typeof error.stack === "string" ? { stack: error.stack } : {}),
    };
  }
  if (error == null) return { name: "Error", message: "Unknown error" };
  return { name: "Error", message: String(error) };
}

export function sanitizeLogContext(value, depth = 0) {
  if (depth > 2) return "[truncated]";
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  if (typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") return `[${typeof value}]`;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeLogContext(item, depth + 1));
  if (typeof value !== "object") return String(value);

  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    if (errorKeyPattern.test(key) || privateDataKeyPattern.test(key)) {
      result[key] = "[redacted]";
      continue;
    }
    result[key] = sanitizeLogContext(entry, depth + 1);
  }
  return result;
}

export function configureErrorReporter(nextReporter) {
  reporter = nextReporter && typeof nextReporter.report === "function"
    ? nextReporter
    : null;
}

export function reportLogEvent(payload) {
  try {
    if (!reporter) return false;
    const safePayload = {
      level: payload?.level || "error",
      message: typeof payload?.message === "string" ? payload.message : String(payload?.message || "Unknown error"),
      context: sanitizeLogContext(payload?.context || {}),
      ...(payload?.error !== undefined ? { error: serializeError(payload.error) } : {}),
      timestamp: new Date().toISOString(),
    };

    if (payload?.error && typeof payload.error === "object" && reportedErrors) {
      if (reportedErrors.has(payload.error)) return true;
      reportedErrors.add(payload.error);
    }

    const result = reporter.report(safePayload);
    if (result instanceof Promise) {
      result.catch(() => {});
      return true;
    }
    return result !== false;
  } catch {
    return false;
  }
}

export const errorReporter = Object.freeze({
  configure: configureErrorReporter,
  report: reportLogEvent,
  normalizeError: serializeError,
  sanitizeContext: sanitizeLogContext,
});
