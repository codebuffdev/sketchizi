// Element-level inline text colors ("runs") for Excalidraw text elements.
//
//   element.customData.runs = [{ text: "text ", }, { text: "hello", color: "#e03131" }]
//
// Runs index the element's *originalText* (what the editor textarea shows), and
// a run without `color` falls back to the element's base `strokeColor`. Runs
// live in customData because Excalidraw text elements have no native span
// support and customData survives scene sync, persistence and undo/redo.
//
// Everything here is pure (no DOM) so it can be unit-tested. The canvas overlay,
// editor mirror and export code all use the same layout so they stay in step.

import { safeCssColor } from "./richTextModel.js";

export const RUNS_KEY = "runs";

// CSS family names Excalidraw registers for its numeric font ids.
export const FONT_CSS_FAMILY = {
  1: "Virgil",
  2: "Helvetica, Segoe UI Emoji",
  3: "Cascadia",
  5: "Excalifont",
  6: "Nunito",
  7: "Lilita One",
  8: "Comic Shanns",
  9: "Liberation Sans",
};

export function fontStringFor(element) {
  const family = FONT_CSS_FAMILY[element?.fontFamily] || FONT_CSS_FAMILY[5];
  return `${Number(element?.fontSize) || 20}px ${family}, sans-serif`;
}

export const lineHeightPxFor = (element) =>
  (Number(element?.fontSize) || 20) * (Number(element?.lineHeight) || 1.25);

// Canonical form so "#F00", "#f00" and "rgb(255,0,0)" all resolve to "#ff0000".
const canonicalColor = (color) => {
  const value = String(color || "").trim();
  if (!value) return "";
  const css = safeCssColor(value);
  if (!css) return value.toLowerCase();
  return /^#[0-9a-f]{3}$/.test(css) ? `#${[...css.slice(1)].map((c) => c + c).join("")}` : css;
};
const resolveKey = canonicalColor;

export const baseColorOf = (element) => String(element?.strokeColor || "#1e1e1e");

const isText = (element) => element?.type === "text" && !element.isDeleted;

export const textOf = (element) =>
  typeof element?.originalText === "string" ? element.originalText : String(element?.text ?? "");

export function getElementRuns(element) {
  const runs = element?.customData?.[RUNS_KEY];
  return Array.isArray(runs) ? runs : [];
}

// Merge adjacent runs that share the same *resolved* color and drop `color`
// from runs that already equal the base color, so `runs` stays compact.
export function compactRuns(runs, baseColor) {
  const baseKey = resolveKey(baseColor);
  const out = [];
  for (const run of runs || []) {
    if (!run || typeof run.text !== "string" || run.text === "") continue;
    const key = resolveKey(run.color);
    const explicit = key && key !== baseKey ? key : null;
    const last = out[out.length - 1];
    if (last && (last.color || null) === explicit) last.text += run.text;
    else out.push(explicit ? { text: run.text, color: explicit } : { text: run.text });
  }
  return out;
}

const totalLength = (runs) => runs.reduce((sum, run) => sum + run.text.length, 0);

// Runs that exactly cover `text`, or one uncolored run when they are missing or
// stale (text changed by something that did not update the runs).
export function runsForText(element, text = textOf(element)) {
  const runs = getElementRuns(element);
  if (runs.length && totalLength(runs) === text.length) return runs.map((run) => ({ ...run }));
  return text ? [{ text }] : [];
}

function splitAt(runs, offset) {
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

export function sliceRuns(runs, start, end) {
  const out = [];
  let pos = 0;
  for (const run of runs) {
    const from = Math.max(start, pos);
    const to = Math.min(end, pos + run.text.length);
    if (to > from) out.push({ ...run, text: run.text.slice(from - pos, to - pos) });
    pos += run.text.length;
  }
  return out;
}

function clampRange(range, length) {
  if (!range) return null;
  const a = Number(range.start);
  const b = Number(range.end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const start = Math.max(0, Math.min(length, Math.min(a, b)));
  const end = Math.max(0, Math.min(length, Math.max(a, b)));
  return { start, end };
}

function withRuns(customData, runs) {
  const { [RUNS_KEY]: _dropped, ...others } = customData || {};
  if (runs && runs.length) return { ...others, [RUNS_KEY]: runs };
  return Object.keys(others).length ? others : undefined;
}

export const withoutRuns = (element) =>
  getElementRuns(element).length ? { ...element, customData: withRuns(element.customData, null) } : element;

// Dual-mode color application. Returns a patch for the element.
//  Case A (non-collapsed range): only that range gets the color; strokeColor
//          is left alone.
//  Case B (no range / caret only): the base strokeColor changes and every
//          per-run override is cleared so the whole box updates uniformly.
export function applyColorToElement(element, color, range = null, text = textOf(element)) {
  const span = clampRange(range, text.length);
  if (!span || span.start === span.end) {
    return { strokeColor: color, customData: withRuns(element.customData, null) };
  }
  const split = splitAt(splitAt(runsForText(element, text), span.start), span.end);
  let pos = 0;
  const painted = split.map((run) => {
    const start = pos;
    pos += run.text.length;
    return start >= span.start && pos <= span.end ? { ...run, color } : run;
  });
  const compact = compactRuns(painted, baseColorOf(element));
  const uniform = compact.length === 1 && !compact[0].color;
  return { customData: withRuns(element.customData, uniform ? null : compact) };
}

// Resolved color at a caret or across a highlight.
//  string = one color, null = mixed colors, undefined = nothing to report.
export function colorAtSelection(element, range, text = textOf(element)) {
  const base = baseColorOf(element);
  if (!text) return resolveKey(base);
  const runs = runsForText(element, text);
  const colors = [];
  for (const run of runs) for (let i = 0; i < run.text.length; i++) colors.push(resolveKey(run.color) || resolveKey(base));
  const span = clampRange(range, text.length) || { start: 0, end: 0 };
  if (span.start === span.end) return colors[Math.max(0, span.start - 1)];
  const picked = new Set(colors.slice(span.start, span.end));
  return picked.size === 1 ? [...picked][0] : null;
}

// Keep runs aligned with edited text. The changed middle is found by trimming
// the common prefix/suffix; inserted characters inherit the color of the
// character before them (typing continues in the surrounding color).
export function rebaseRuns(runs, oldText, nextText, baseColor) {
  if (!runs.length || oldText === nextText) return compactRuns(runs, baseColor);
  const limit = Math.min(oldText.length, nextText.length);
  let prefix = 0;
  while (prefix < limit && oldText[prefix] === nextText[prefix]) prefix++;
  let suffix = 0;
  while (suffix < limit - prefix && oldText[oldText.length - 1 - suffix] === nextText[nextText.length - 1 - suffix]) suffix++;
  const inserted = nextText.slice(prefix, nextText.length - suffix);
  const head = sliceRuns(runs, 0, prefix);
  const tail = sliceRuns(runs, oldText.length - suffix, oldText.length);
  const anchor = sliceRuns(runs, Math.max(0, prefix - 1), Math.max(1, prefix))[0];
  const insertColor = anchor?.color;
  const middle = inserted ? [insertColor ? { text: inserted, color: insertColor } : { text: inserted }] : [];
  return compactRuns([...head, ...middle, ...tail], baseColor);
}

// Excalidraw wraps container text by turning spaces into "\n" (or splitting long
// words). Map every character of the wrapped text to its original index, or -1
// for an inserted break. Returns null if the two strings do not line up.
export function mapWrappedToOriginal(original, wrapped) {
  const map = new Array(wrapped.length);
  let j = 0;
  for (let i = 0; i < wrapped.length; i++) {
    const c = wrapped[i];
    if (j < original.length && c === original[j]) { map[i] = j; j++; continue; }
    if (c !== "\n") return null;
    map[i] = -1;
    while (original[j] === " ") j++;
  }
  return map;
}

// Lay runs out line by line. `measure(text)` returns a pixel width; each
// segment advances the x cursor by its own measured width.
export function layoutRuns(element, measure) {
  const original = textOf(element);
  const wrapped = typeof element.text === "string" ? element.text : original;
  const runs = getElementRuns(element);
  if (!runs.length || totalLength(runs) !== original.length) return null;
  const map = mapWrappedToOriginal(original, wrapped);
  if (!map) return null;

  const base = baseColorOf(element);
  const colors = [];
  for (const run of compactRuns(runs, base)) for (let i = 0; i < run.text.length; i++) colors.push(run.color || null);

  const lineHeight = lineHeightPxFor(element);
  const align = element.textAlign || "left";
  const lines = [];
  let cursor = 0;
  wrapped.split("\n").forEach((lineText, index) => {
    const segments = [];
    for (let k = 0; k < lineText.length; k++) {
      const color = colors[map[cursor + k]] ?? null;
      const last = segments[segments.length - 1];
      if (last && last.color === color) last.text += lineText[k];
      else segments.push({ text: lineText[k], color });
    }
    cursor += lineText.length + 1;
    let x = 0;
    for (const segment of segments) { segment.x = x; segment.width = measure(segment.text); x += segment.width; }
    const width = x;
    const offsetX = align === "center" ? (element.width - width) / 2 : align === "right" ? element.width - width : 0;
    lines.push({ index, y: index * lineHeight, width, offsetX, segments });
  });
  return { lines, lineHeight, base };
}

export const hasColoredSegments = (layout) =>
  !!layout && layout.lines.some((line) => line.segments.some((segment) => segment.color));

// Export: replace each multi-color text element with one single-line, single-color
// text element per segment. Excalidraw's own SVG/PNG renderer then draws them, so
// font, baseline and anti-aliasing match the on-canvas text exactly.
export function expandRunsForExport(elements, measureFor) {
  const out = [];
  for (const element of elements) {
    if (!isText(element) || !getElementRuns(element).length) { out.push(element); continue; }
    const layout = layoutRuns(element, measureFor(element));
    if (!hasColoredSegments(layout)) { out.push(element); continue; }
    const angle = Number(element.angle) || 0;
    const cx = element.x + element.width / 2;
    const cy = element.y + element.height / 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    layout.lines.forEach((line) => {
      line.segments.forEach((segment, si) => {
        if (!segment.text.trim()) return; // whitespace only: advances x, draws nothing
        const centerX = element.x + line.offsetX + segment.x + segment.width / 2;
        const centerY = element.y + line.y + layout.lineHeight / 2;
        const dx = centerX - cx;
        const dy = centerY - cy;
        const rx = cx + dx * cos - dy * sin;
        const ry = cy + dx * sin + dy * cos;
        out.push({
          ...element,
          id: `${element.id}::run:${line.index}:${si}`,
          text: segment.text,
          originalText: segment.text,
          strokeColor: segment.color || layout.base,
          x: rx - segment.width / 2,
          y: ry - layout.lineHeight / 2,
          width: segment.width,
          height: layout.lineHeight,
          textAlign: "left",
          verticalAlign: "top",
          containerId: null,
          boundElements: null,
          customData: undefined,
        });
      });
    });
  }
  return out;
}

// Element copy with its runs replaced (empty/uniform runs are removed so the box
// falls back to its base strokeColor).
export function setElementRuns(element, runs) {
  const compact = compactRuns(runs || [], baseColorOf(element));
  const uniform = compact.length === 0 || (compact.length === 1 && !compact[0].color);
  return { ...element, customData: withRuns(element.customData, uniform ? null : compact) };
}

export const runsCoverText = (element, text) => {
  const runs = getElementRuns(element);
  return runs.length > 0 && totalLength(runs) === text.length;
};
