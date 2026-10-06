import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const LEVELS = Object.freeze({ debug: 10, info: 20, warn: 30, error: 40 });
let applicationVersion = "unknown";
try {
  applicationVersion = JSON.parse(readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8")).version || "unknown";
} catch {}
const minimumLevel = LEVELS[String(process.env.SKETCHIZI_LOG_LEVEL || "info").toLowerCase()] ?? LEVELS.info;

const redactKey = /(password|passwd|token|jwt|api[-_]?key|secret|cookie|authorization|auth[-_]?header|private[-_]?key)/i;

function sanitize(value, depth = 0) {
  if (depth > 2) return "[truncated]";
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (typeof value !== "object") return String(value);
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    output[key] = redactKey.test(key) ? "[redacted]" : sanitize(entry, depth + 1);
  }
  return output;
}

function write(level, message, context = {}, error) {
  if ((LEVELS[level] || LEVELS.info) < minimumLevel) return;
  const payload = {
    timestamp: new Date().toISOString(),
    service: "sketchizi-collaboration",
    applicationVersion,
    level,
    message: typeof message === "string" ? message : String(message ?? ""),
    ...(Object.keys(context || {}).length ? { context: sanitize(context) } : {}),
    ...(error ? { error: { name: error?.name, message: error?.message, stack: error?.stack } } : {}),
  };
  const output = JSON.stringify(payload);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}

export const serverLogger = Object.freeze({
  debug: (message, context) => write("debug", message, context),
  info: (message, context) => write("info", message, context),
  warn: (message, context) => write("warn", message, context),
  error: (message, error, context) => write("error", message, context, error),
});
