/**
 * Filename extension -> highlighter grammar + header badge.
 * Framework-free so it can be unit-tested in plain Node.
 */

export const DEFAULT_CODE_FILENAME = "test.ts";
export const FILENAME_PLACEHOLDER = "snippet.ts";
export const MAX_FILENAME_LENGTH = 48;

export const CODE_LANGUAGES = Object.freeze({
  typescript: { id: "typescript", label: "TypeScript", badge: "TS" },
  javascript: { id: "javascript", label: "JavaScript", badge: "JS" },
  java: { id: "java", label: "Java", badge: "JAVA" },
  python: { id: "python", label: "Python", badge: "PY" },
  sql: { id: "sql", label: "SQL", badge: "SQL" },
  json: { id: "json", label: "JSON", badge: "JSON" },
  bash: { id: "bash", label: "Bash", badge: "BASH" },
  yaml: { id: "yaml", label: "YAML", badge: "YAML" },
  html: { id: "html", label: "HTML", badge: "HTML" },
  css: { id: "css", label: "CSS", badge: "CSS" },
  plain: { id: "plain", label: "Plain text", badge: "TXT" },
});

const EXTENSION_TO_LANGUAGE = Object.freeze({
  ts: "typescript", tsx: "typescript", mts: "typescript", cts: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  java: "java",
  py: "python",
  sql: "sql",
  json: "json",
  sh: "bash", bash: "bash", zsh: "bash",
  yaml: "yaml", yml: "yaml",
  html: "html", htm: "html",
  css: "css",
});

/** Lower-cased extension of a filename ("Foo.Test.TSX" -> "tsx"), or "". */
export function fileExtension(filename) {
  const name = String(filename ?? "").trim();
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "";
  return name.slice(dot + 1).toLowerCase();
}

/** Language id for a filename; unknown or missing extensions fall back to "plain". */
export function languageForFilename(filename) {
  return EXTENSION_TO_LANGUAGE[fileExtension(filename)] || "plain";
}

/** Badge text (TS, JAVA, PY ...) for a filename; "" for plain text so no badge is drawn. */
export function badgeForFilename(filename) {
  const language = languageForFilename(filename);
  return language === "plain" ? "" : CODE_LANGUAGES[language].badge;
}

/** Collapse whitespace/newlines out of a filename and cap its length. */
export function sanitizeFilename(value) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").slice(0, MAX_FILENAME_LENGTH);
}

/** What the header shows: the typed filename, or the default when it is blank. */
export function effectiveFilename(value) {
  const clean = sanitizeFilename(value).trim();
  return clean || DEFAULT_CODE_FILENAME;
}
