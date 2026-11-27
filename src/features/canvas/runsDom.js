// DOM helpers for the contentEditable runs editor (textEditorRunsMirror.js).
//
// The editor's DOM is a flat list of text nodes and <br>s, optionally wrapped in
// <span data-sk-color="..."> for colored runs. Offsets used everywhere else
// (textarea selection, element.originalText, runs) count one character per text
// character and one per <br> ("\n"). A trailing <br> that is the last leaf is a
// layout placeholder (browsers need it to show a final empty line) and carries no
// character.

export const SK_COLOR_ATTR = "data-sk-color";

const isBr = (node) => node.nodeName === "BR";

export function* leaves(root) {
  for (const child of root.childNodes) {
    if (child.nodeType === 3) { if (child.nodeValue) yield child; }
    else if (child.nodeName === "BR") yield child;
    else if (child.nodeType === 1) yield* leaves(child);
  }
}

const leafLength = (leaf) => (isBr(leaf) ? 1 : leaf.nodeValue.length);

function significantLeaves(root) {
  const all = [...leaves(root)];
  if (all.length && isBr(all[all.length - 1])) all.pop(); // placeholder BR
  return all;
}

function colorOf(leaf, root) {
  for (let node = leaf.parentNode; node && node !== root; node = node.parentNode) {
    const color = node.getAttribute?.(SK_COLOR_ATTR);
    if (color) return color;
  }
  return null;
}

// -> { text, runs: [{ text, color? }] } with adjacent same-color runs merged.
export function readModel(root) {
  const runs = [];
  let text = "";
  for (const leaf of significantLeaves(root)) {
    const piece = isBr(leaf) ? "\n" : leaf.nodeValue;
    const color = colorOf(leaf, root);
    text += piece;
    const last = runs[runs.length - 1];
    if (last && (last.color || null) === color) last.text += piece;
    else runs.push(color ? { text: piece, color } : { text: piece });
  }
  return { text, runs };
}

// Rebuild the DOM from runs. `darkFilter` is the CSS filter Excalidraw's dark
// theme effectively applies to raw stroke colors.
export function renderRuns(root, runs, { darkFilter = "" } = {}) {
  const doc = root.ownerDocument;
  const fragment = doc.createDocumentFragment();
  let text = "";
  for (const run of runs) {
    text += run.text;
    const parts = run.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) fragment.appendChild(doc.createElement("br"));
      if (!part) return;
      if (run.color) {
        const span = doc.createElement("span");
        span.setAttribute(SK_COLOR_ATTR, run.color);
        span.style.color = run.color;
        if (darkFilter) span.style.filter = darkFilter;
        span.textContent = part;
        fragment.appendChild(span);
      } else fragment.appendChild(doc.createTextNode(part));
    });
  }
  if (text.endsWith("\n")) fragment.appendChild(doc.createElement("br")); // placeholder for the last empty line
  root.replaceChildren(fragment);
}

// Character offset of a DOM point.
export function pointToOffset(root, node, offset) {
  const doc = root.ownerDocument;
  const point = doc.createRange();
  point.setStart(node, offset);
  point.collapse(true);
  let total = 0;
  for (const leaf of significantLeaves(root)) {
    if (leaf === node) return total + (isBr(leaf) ? (offset > 0 ? 1 : 0) : offset);
    const after = doc.createRange();
    after.setStartAfter(leaf);
    after.collapse(true);
    if (point.compareBoundaryPoints(Range.START_TO_START, after) >= 0) total += leafLength(leaf);
    else break;
  }
  return total;
}

// DOM point for a character offset.
export function offsetToPoint(root, target) {
  let pos = 0;
  for (const leaf of significantLeaves(root)) {
    if (isBr(leaf)) {
      if (target <= pos) return { node: leaf.parentNode, offset: [...leaf.parentNode.childNodes].indexOf(leaf) };
      pos += 1;
    } else {
      const length = leaf.nodeValue.length;
      if (target <= pos + length) return { node: leaf, offset: target - pos };
      pos += length;
    }
  }
  // Past the last character: end of the root, before a trailing placeholder <br>.
  const last = root.lastChild;
  const placeholder = last && isBr(last) && [...leaves(root)].pop() === last;
  return { node: root, offset: root.childNodes.length - (placeholder ? 1 : 0) };
}

export function getOffsets(root) {
  const selection = root.ownerDocument.defaultView?.getSelection?.();
  if (!selection || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const a = pointToOffset(root, range.startContainer, range.startOffset);
  const b = pointToOffset(root, range.endContainer, range.endOffset);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

export function setOffsets(root, start, end) {
  const selection = root.ownerDocument.defaultView?.getSelection?.();
  if (!selection) return;
  const from = offsetToPoint(root, start);
  const to = start === end ? from : offsetToPoint(root, end);
  const range = root.ownerDocument.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  selection.removeAllRanges();
  selection.addRange(range);
}
