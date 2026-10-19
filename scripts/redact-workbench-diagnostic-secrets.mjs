/** Redact common credential formats from diagnostic text before it is persisted or shared. */
const REDACTION_RULES = [
  { regex: /(\bAuthorization\s*:\s*(?:Bearer|Basic)\s+)[^\s,;]+/gi, replacement: "$1[REDACTED]" },
  { regex: /(\bBearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, replacement: "$1[REDACTED]" },
  { regex: /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret|token)\s*[=:]\s*["']?)[^\s"'&,;]+/gi, replacement: "$1[REDACTED]" },
  { regex: /\b(gh[pousr]_[A-Za-z0-9]{20,})\b/g, replacement: "[REDACTED_GITHUB_TOKEN]" },
  { regex: /\b(sk-[A-Za-z0-9_-]{20,})\b/g, replacement: "[REDACTED_API_KEY]" },
  { regex: /(\b(?:postgres(?:ql)?|mysql):\/\/[^:\s/@]+:)[^@\s/]+(@)/gi, replacement: "$1[REDACTED]$2" },
  { regex: /(\bhttps?:\/\/)[^\s/:@]+:[^\s/@]+@/gi, replacement: "$1[REDACTED]@" },
];

export function redactDiagnosticText(value) {
  let text = String(value);
  for (const rule of REDACTION_RULES) text = text.replace(rule.regex, rule.replacement);
  return text;
}

export function shouldRedactDiagnosticPath(relativePath) {
  const normalized = String(relativePath).replaceAll("\\", "/");
  return normalized.includes("/ci-logs/")
    || normalized.startsWith("artifacts/ci-logs/")
    || normalized.endsWith("workbench-release-failure-analysis.json")
    || normalized.endsWith("workbench-release-failure-analysis.md");
}
