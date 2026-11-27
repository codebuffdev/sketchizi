/**
 * Markdown-style list shortcuts for Excalidraw plain-text editor.
 * Markers remain text for native scene persistence and collaboration.
 */

/** Heading level -> font size (px). Body text is restored to BODY_FONT_SIZE. */
export const MARKDOWN_HEADING_SIZES = Object.freeze({ 1: 32, 2: 26, 3: 22 });
export const BODY_FONT_SIZE = 20;

function currentLine(value, caret) {
  const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
  const nextNewline = value.indexOf("\n", caret);
  return { lineStart, lineEnd: nextNewline === -1 ? value.length : nextNewline };
}

/**
 * `input` fallback (IME / mobile keyboards that report key "Unidentified"):
 * if the caret sits right after a just-typed "# ", "## " or "### " at the
 * start of its line, strip that prefix and keep whatever text follows it.
 */
export function getMarkdownHeadingInputEdit({ value, selectionStart, selectionEnd }) {
  if (typeof value !== "string" || selectionStart !== selectionEnd) return null;
  const { lineStart, lineEnd } = currentLine(value, selectionStart);
  const match = value.slice(lineStart, lineEnd).match(/^(#{1,3})\s(.*)$/);
  if (!match || selectionStart !== lineStart + match[1].length + 1) return null;
  const level = match[1].length;
  return { start: lineStart, end: selectionStart, text: "", headingLevel: level, headingFontSize: MARKDOWN_HEADING_SIZES[level] };
}


// ---------------------------------------------------------------------------
// Ordered-list normalization and list-aware paste.
//
// The editor converts a typed "6." + Space into "6․ " (U+2024 one-dot leader), but pasted text and
// hand-typed lists use "." or ")". Every helper below accepts all three separators.
// ---------------------------------------------------------------------------

// A leading number or bullet marker. Numbers/bullets must be followed by whitespace (or end of line)
// so "3.14 is pi" and "-5 degrees" are not mistaken for list items.
export const LIST_PREFIX_RE = /^(\s*)(?:\d+[.)․](?:\s+|$)|[-*•●](?:\s+|$))/;
const ORDERED_LINE_RE = /^(\s*)(\d+)([.)․])(\s+)(.*)$/;
const BULLET_LINE_RE = /^(\s*)([-*•●])(\s+)(.*)$/;

/** Strip one leading number/bullet marker, keeping indentation: "  2. text" -> "  text". */
export function stripListPrefix(line) {
  return String(line ?? "").replace(LIST_PREFIX_RE, "$1");
}

function locateCaret(lines, caret) {
  let pos = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const end = pos + lines[i].length;
    if (caret <= end) return { line: i, col: caret - pos };
    pos = end + 1;
  }
  const last = lines.length - 1;
  return { line: last, col: lines[last].length };
}

/**
 * Cascade-renumber the contiguous ordered-list block that contains `caret`.
 * Numbering starts at the block's own first number (usually 1) and runs to the end of the block.
 * Each indent depth keeps its own counter, so nested sub-lists renumber independently.
 * Returns { value, caret, changed }.
 */
export function renumberOrderedListBlock(value, caret = String(value ?? "").length) {
  const text = String(value ?? "");
  const lines = text.split("\n");
  const at = locateCaret(lines, Math.max(0, Math.min(text.length, caret)));
  const isOrdered = (i) => ORDERED_LINE_RE.test(lines[i]);
  // An indented, non-blank line that is not itself numbered stays inside the block (wrapped / nested text).
  const isBlock = (i) => isOrdered(i) || (/^\s+\S/.test(lines[i]));
  if (!isBlock(at.line)) return { value: text, caret, changed: false };
  let start = at.line;
  while (start > 0 && isBlock(start - 1)) start -= 1;
  while (start < at.line && !isOrdered(start)) start += 1;
  let end = at.line;
  while (end < lines.length - 1 && isBlock(end + 1)) end += 1;
  if (!isOrdered(start) && !isOrdered(at.line)) return { value: text, caret, changed: false };

  const stack = [];
  let caretDelta = 0;
  let caretPrefix = null;
  for (let i = start; i <= end; i += 1) {
    const match = lines[i].match(ORDERED_LINE_RE);
    if (!match) continue;
    const [, indent, number, separator, gap, content] = match;
    while (stack.length && stack[stack.length - 1].indent > indent.length) stack.pop();
    let level = stack[stack.length - 1];
    if (!level || level.indent < indent.length) {
      level = { indent: indent.length, next: Number(number), separator };
      stack.push(level);
    }
    const next = `${indent}${level.next}${level.separator}${gap}${content}`;
    level.next += 1;
    if (i === at.line) {
      caretDelta = next.length - lines[i].length;
      caretPrefix = next.length - content.length;
    }
    lines[i] = next;
  }
  const result = lines.join("\n");
  if (result === text) return { value: text, caret, changed: false };
  let newCaret = 0;
  for (let i = 0; i < at.line; i += 1) newCaret += lines[i].length + 1;
  const col = caretPrefix !== null && at.col >= caretPrefix - caretDelta
    ? at.col + caretDelta
    : Math.min(at.col, caretPrefix ?? at.col);
  return { value: result, caret: newCaret + Math.max(0, col), changed: true };
}

// Turn "replace [start,end) with text" into the smallest equivalent edit, then cascade-renumber the
// list block around the resulting caret. Returns the original edit when nothing needs renumbering.
function withRenumber(value, edit) {
  const next = value.slice(0, edit.start) + edit.text + value.slice(edit.end);
  const caret = Number.isInteger(edit.caret) ? edit.caret : edit.start + edit.text.length;
  const renumbered = renumberOrderedListBlock(next, caret);
  if (!renumbered.changed) return edit;
  const target = renumbered.value;
  let head = 0;
  const max = Math.min(value.length, target.length);
  while (head < max && value[head] === target[head]) head += 1;
  let tail = 0;
  while (tail < max - head && value[value.length - 1 - tail] === target[target.length - 1 - tail]) tail += 1;
  return {
    ...edit,
    start: head,
    end: value.length - tail,
    text: target.slice(head, target.length - tail),
    caret: renumbered.caret,
  };
}

/** Edit that fixes stale numbering around the caret after a line was deleted/cut; null if already sequential. */
export function getListRenumberEdit({ value, selectionStart }) {
  if (typeof value !== "string") return null;
  const caret = Number.isInteger(selectionStart) ? selectionStart : value.length;
  const edit = withRenumber(value, { start: caret, end: caret, text: "" });
  return Number.isInteger(edit.caret) ? edit : null;
}

/**
 * Plain-text paste inside a list. Returns an edit, or null to let the browser paste natively.
 *  - the caret sits right after a list marker ("7. |"): the first pasted line loses its own
 *    "1. " prefix, so we get "7. hrllo" and never "7. . hrllo";
 *  - pasted lines 2..N that are list items are re-marked at the caret line's indent and the whole
 *    block is cascade-renumbered, so a pasted "2.", "3." continue as "8.", "9." ...;
 *  - the caret lands at the end of the last pasted line.
 */
export function getListPasteEdit({ value, selectionStart, selectionEnd, text }) {
  if (typeof value !== "string" || typeof text !== "string" || !text) return null;
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop(); // trailing newline from the source
  const lineStart = value.lastIndexOf("\n", start - 1) + 1;
  const lineEndIndex = value.indexOf("\n", end);
  const lineEnd = lineEndIndex === -1 ? value.length : lineEndIndex;
  const before = value.slice(lineStart, start);
  const markerOnly = before.match(/^(\s*)(?:(\d+)([.)․])|([-*•●]))(\s+)$/);
  const wholeLine = value.slice(lineStart, start) + value.slice(end, lineEnd);
  const orderedLine = wholeLine.match(ORDERED_LINE_RE);
  const bulletLine = wholeLine.match(BULLET_LINE_RE);
  const atMarker = Boolean(markerOnly);
  if (!atMarker && !orderedLine && !bulletLine) return null;
  if (lines.length === 1 && !atMarker) return null;

  const ordered = atMarker ? markerOnly[2] !== undefined : Boolean(orderedLine);
  const indent = atMarker ? markerOnly[1] : (orderedLine || bulletLine)[1];
  const separator = atMarker ? (markerOnly[3] || "") : (orderedLine ? orderedLine[3] : "");
  const bulletChar = atMarker ? (markerOnly[4] || "●") : (bulletLine ? bulletLine[2] : "●");
  const marker = (number) => (ordered ? `${number}${separator}` : bulletChar === "-" || bulletChar === "*" ? "●" : bulletChar);

  const rewritten = lines.map((line, index) => {
    if (index === 0) return atMarker ? stripListPrefix(line).trimStart() : line;
    const ordinal = line.match(ORDERED_LINE_RE);
    const bullet = line.match(BULLET_LINE_RE);
    const item = ordinal || bullet;
    if (!item) return line;
    const content = ordinal ? ordinal[5] : bullet[4];
    return `${indent}${item[1]}${marker(1)} ${content}`;
  });
  const insert = rewritten.join("\n");
  return withRenumber(value, { start, end, text: insert, caret: start + insert.length });
}

export function getMarkdownListEdit({ value, selectionStart, selectionEnd, key, isHeading = false }) {
  if (typeof value !== "string" || selectionStart !== selectionEnd) return null;

  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const nextNewline = value.indexOf("\n", selectionStart);
  const lineEnd = nextNewline === -1 ? value.length : nextNewline;
  const beforeCursor = value.slice(lineStart, selectionStart);
  const afterCursor = value.slice(selectionStart, lineEnd);

  if (key === " ") {
    // Markdown heading markers: # / ## / ### typed at the start of a line,
    // even in front of existing text ("hello" -> "# hello" -> H1 "hello").
    // Only the prefix is replaced, so the caret lands before the old text.
    const heading = beforeCursor.match(/^(\s*)(#{1,3})$/);
    if (heading) {
      const level = heading[2].length;
      return {
        start: lineStart,
        end: selectionStart,
        text: heading[1],
        headingLevel: level,
        headingFontSize: MARKDOWN_HEADING_SIZES[level],
      };
    }
    if (afterCursor.length) return null;
    const numbered = beforeCursor.match(/^(\s*)(\d+)\.$/);
    if (numbered) {
      return { start: lineStart, end: selectionStart, text: numbered[1] + numbered[2] + "․ " };
    }
    const bullet = beforeCursor.match(/^(\s*)([-*])$/);
    if (bullet) {
      return { start: lineStart, end: selectionStart, text: `${bullet[1]}● ` };
    }
    return null;
  }

  if (key === "Enter") {
    const listItem = beforeCursor.match(/^(\s*)(●|\d+․)\s+(.*)$/);
    if (!listItem) return null;
    const [, indent, marker, content] = listItem;
    if (!content.trim() && !afterCursor.length) {
      return { start: lineStart, end: selectionStart, text: "\n" };
    }
    const number = marker.match(/^(\d+)․$/);
    const nextMarker = number ? `${Number(number[1]) + 1}․ ` : "● ";
    return withRenumber(value, { start: selectionStart, end: selectionStart, text: `\n${indent}${nextMarker}` });
  }

  if (key === "Backspace") {
    // Caret at offset 0 of a heading box: revert to body text, delete nothing.
    if (isHeading && selectionStart === 0) {
      return { start: 0, end: 0, text: "", revertHeading: true, headingFontSize: BODY_FONT_SIZE };
    }
    // Undo unordered-list conversion: restore the typed hyphen.
    const bulletMarker = beforeCursor.match(/^(\s*)●\s+$/);
    if (bulletMarker) {
      return {
        start: lineStart,
        end: selectionStart,
        text: afterCursor.length ? `${bulletMarker[1]}- ` : `${bulletMarker[1]}-`,
      };
    }

    // Undo ordered-list conversion: restore the literal number.
    const numberedMarker = beforeCursor.match(/^(\s*)(\d+)․\s+$/);
    if (numberedMarker) {
      return {
        start: lineStart,
        end: selectionStart,
        text: afterCursor.length ? `${numberedMarker[1]}${numberedMarker[2]} ` : `${numberedMarker[1]}${numberedMarker[2]}`,
      };
    }
  }

  return null;
}

export function applyMarkdownListEdit(textarea, edit) {
  if (!textarea || !edit) return false;
  if (edit.revertHeading) return true; // style-only: leave the text untouched
  textarea.setRangeText(edit.text, edit.start, edit.end, "end");
  if (Number.isInteger(edit.caret)) textarea.setSelectionRange(edit.caret, edit.caret);
  const inputEvent = typeof InputEvent === "function"
    ? new InputEvent("input", { bubbles: true, inputType: edit.inputType || "insertText", data: edit.text })
    : new Event("input", { bubbles: true });
  textarea.dispatchEvent(inputEvent);
  return true;
}
