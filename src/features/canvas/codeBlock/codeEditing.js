/**
 * Pure keybinding logic for the Code Block editor.
 *
 * Every function takes { value, selectionStart, selectionEnd } and returns an
 * edit { replaceStart, replaceEnd, text, selectionStart, selectionEnd } meaning:
 * replace value[replaceStart, replaceEnd) with `text`, then place the selection.
 * Returns null when the key should keep its native behaviour.
 */

export const INDENT = "  ";

const OPENERS = { "{": "}", "[": "]", "(": ")" };
const colonLanguages = new Set(["python", "yaml"]);

const lineStartOf = (value, index) => value.lastIndexOf("\n", index - 1) + 1;
const lineEndOf = (value, index) => {
  const end = value.indexOf("\n", index);
  return end < 0 ? value.length : end;
};

/** Leading whitespace (spaces/tabs) of the line containing `index`. */
export function leadingWhitespace(value, index) {
  const start = lineStartOf(value, index);
  return value.slice(start).match(/^[ \t]*/)[0];
}

/** Normalise clipboard text: unify newlines, nothing else (tabs/spaces kept verbatim). */
export function normalizePastedCode(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ");
}

/** Enter: keep the line's indent; add one level after { [ ( (and : for Python/YAML). */
export function getEnterEdit({ value, selectionStart, selectionEnd, language = "plain" }) {
  const start = Math.min(selectionStart, selectionEnd);
  const end = Math.max(selectionStart, selectionEnd);
  const indent = leadingWhitespace(value, start);
  const before = value.slice(lineStartOf(value, start), start).trimEnd();
  const last = before.slice(-1);
  const opens = last in OPENERS || (last === ":" && colonLanguages.has(language));
  const nextChar = value[end];
  const splitsPair = last in OPENERS && nextChar === OPENERS[last];

  if (opens && splitsPair) {
    const inner = `\n${indent}${INDENT}`;
    const text = `${inner}\n${indent}`;
    const caret = start + inner.length;
    return { replaceStart: start, replaceEnd: end, text, selectionStart: caret, selectionEnd: caret };
  }
  const text = `\n${indent}${opens ? INDENT : ""}`;
  const caret = start + text.length;
  return { replaceStart: start, replaceEnd: end, text, selectionStart: caret, selectionEnd: caret };
}

function selectedLineRange(value, selectionStart, selectionEnd) {
  const start = Math.min(selectionStart, selectionEnd);
  let end = Math.max(selectionStart, selectionEnd);
  // A selection that stops at column 0 of a line does not include that line.
  if (end > start && value[end - 1] === "\n") end -= 1;
  return { from: lineStartOf(value, start), to: lineEndOf(value, end) };
}

/**
 * Tab / Shift+Tab.
 *  - collapsed caret + Tab        -> insert two spaces
 *  - collapsed caret + Shift+Tab  -> outdent the current line
 *  - any selection                -> indent / outdent every touched line
 */
export function getTabEdit({ value, selectionStart, selectionEnd, shiftKey = false }) {
  const collapsed = selectionStart === selectionEnd;
  if (collapsed && !shiftKey) {
    const caret = selectionStart + INDENT.length;
    return { replaceStart: selectionStart, replaceEnd: selectionEnd, text: INDENT, selectionStart: caret, selectionEnd: caret };
  }

  const { from, to } = selectedLineRange(value, selectionStart, selectionEnd);
  const lines = value.slice(from, to).split("\n");

  // Per touched line: where it starts in the original text and how many
  // characters are added (+) or removed (-) at its start.
  const infos = [];
  let cursor = from;
  const rewritten = lines.map((line) => {
    let change = 0;
    let out = line;
    if (!shiftKey) {
      // Blank lines inside a multi-line block stay blank.
      if (line.length || lines.length === 1) { change = INDENT.length; out = INDENT + line; }
    } else if (line.startsWith("\t")) { change = -1; out = line.slice(1); }
    else {
      const lead = line.match(/^ {1,2}/);
      if (lead) { change = -lead[0].length; out = line.slice(lead[0].length); }
    }
    infos.push({ start: cursor, change });
    cursor += line.length + 1;
    return out;
  });

  const mapIndex = (index) => {
    let mapped = index;
    for (const { start, change } of infos) {
      if (change > 0 && index >= start) mapped += change;
      else if (change < 0 && index > start) mapped += Math.max(change, -(index - start));
    }
    return mapped;
  };

  const text = rewritten.join("\n");
  return {
    replaceStart: from,
    replaceEnd: to,
    text,
    selectionStart: mapIndex(selectionStart),
    selectionEnd: mapIndex(selectionEnd),
  };
}

/** Apply an edit to a plain string (used by tests and as the non-DOM fallback). */
export function applyEdit(value, edit) {
  return {
    value: value.slice(0, edit.replaceStart) + edit.text + value.slice(edit.replaceEnd),
    selectionStart: edit.selectionStart,
    selectionEnd: edit.selectionEnd,
  };
}
