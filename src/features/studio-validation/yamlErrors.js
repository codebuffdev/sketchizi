/** Shared YAML error formatting for the Kubernetes and Docker Compose studios. */

const YAML_ERROR_HINTS = {
  TAB_AS_INDENT: "Replace tab characters with spaces; YAML does not allow tabs for indentation.",
  DUPLICATE_KEY: "Remove or rename the duplicate key; each key may appear only once per mapping.",
  BAD_INDENT: "Fix the indentation so it matches the surrounding lines (use two spaces per level).",
  BLOCK_AS_IMPLICIT_KEY: "Put the value on its own line or quote it; a nested mapping cannot be used inline here.",
  MULTILINE_IMPLICIT_KEY: "Keep the key and its colon on a single line.",
  MISSING_CHAR: "Add the missing character (often a colon, quote, bracket, or brace).",
  BAD_ALIAS: "Define the anchor (&name) before referencing it with *name.",
  UNEXPECTED_TOKEN: "Check for stray characters, missing colons after keys, or unquoted special characters.",
};

/** Convert a `yaml` library error into a stable, human-readable record. */
export function formatYamlError(error, label = "YAML") {
  const raw = String(error?.message || "Unknown YAML error");
  const reason = raw.split(/\s+at line\s+\d+/)[0].split("\n")[0].trim().replace(/[.:]$/, "");
  const position = Array.isArray(error?.linePos) ? error.linePos[0] : null;
  const line = Number.isInteger(position?.line) ? position.line : null;
  const column = Number.isInteger(position?.col) ? position.col : null;
  const hint = YAML_ERROR_HINTS[error?.code] || "Check indentation, colons, and quoting near that line.";
  const where = line ? ` on line ${line}${column ? `, column ${column}` : ""}` : "";
  return {
    code: error?.code || "YAML_SYNTAX_ERROR",
    line, column,
    message: `${label} syntax error${where}: ${reason}. ${hint}`,
  };
}

