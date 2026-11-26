// Pure model for rich text boxes: a box-level color plus a list of text runs,
// where a run may carry an inline color override. No DOM access here so the
// color rules stay unit-testable.

export function createRichText(text = "", color = null) {
  return { color, runs: text ? [{ text: String(text), color: null }] : [] };
}

export function plainText(doc) {
  return (doc?.runs || []).map((run) => run.text).join("");
}

export function normalizeRuns(runs) {
  const out = [];
  for (const run of runs || []) {
    if (!run || !run.text) continue;
    const color = run.color || null;
    const last = out[out.length - 1];
    if (last && (last.color || null) === color) last.text += run.text;
    else out.push({ text: run.text, color });
  }
  return out;
}

function splitRunsAt(runs, offset) {
  const out = [];
  let pos = 0;
  for (const run of runs) {
    const end = pos + run.text.length;
    if (offset > pos && offset < end) {
      out.push({ ...run, text: run.text.slice(0, offset - pos) }, { ...run, text: run.text.slice(offset - pos) });
    } else out.push({ ...run });
    pos = end;
  }
  return out;
}

export function normalizeRange(range, length) {
  if (!range) return null;
  const a = Math.max(0, Math.min(length, Number(range.start)));
  const b = Math.max(0, Math.min(length, Number(range.end)));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

// Dual-mode color application.
//  - No range, or a collapsed range (whole box selected): the box color changes
//    and every inline color override is cleared.
//  - Non-collapsed range (highlighted substring): only that portion gets an
//    inline color; the rest of the box is untouched.
export function applyColor(doc, color, range = null) {
  const runs = normalizeRuns(doc?.runs);
  const length = runs.reduce((sum, run) => sum + run.text.length, 0);
  const span = normalizeRange(range, length);
  if (!span || span.start === span.end) {
    return { ...doc, color, runs: normalizeRuns(runs.map((run) => ({ ...run, color: null }))) };
  }
  const split = splitRunsAt(splitRunsAt(runs, span.start), span.end);
  let pos = 0;
  const next = split.map((run) => {
    const start = pos;
    pos += run.text.length;
    return start >= span.start && pos <= span.end ? { ...run, color } : run;
  });
  return { ...doc, runs: normalizeRuns(next) };
}

const escapeHtml = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Colors reach CSS, so only accept simple hex / rgb() values.
export function safeCssColor(value) {
  const color = String(value || "").trim();
  if (/^#[0-9a-f]{3,8}$/i.test(color)) return color.toLowerCase();
  const rgb = color.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/i);
  if (rgb) return `#${rgb.slice(1, 4).map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("")}`;
  return null;
}

export function toHtml(doc) {
  let html = (doc?.runs || []).map((run) => {
    const body = escapeHtml(run.text).replace(/\n/g, "<br>");
    const color = safeCssColor(run.color);
    return color ? `<span style="color: ${color}">${body}</span>` : body;
  }).join("");
  if (plainText(doc).endsWith("\n")) html += "<br>"; // keep trailing blank line visible
  return html;
}
