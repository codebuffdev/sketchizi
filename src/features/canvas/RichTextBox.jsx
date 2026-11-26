import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { applyColor, normalizeRuns, safeCssColor, toHtml } from "./richTextModel.js";
import { registerRichTextBox } from "./richTextColorBridge.js";

// Walk text nodes / <br> in document order. <br> counts as one "\n" character.
function* leaves(node) {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE || child.nodeName === "BR") yield child;
    else if (child.nodeType === Node.ELEMENT_NODE) yield* leaves(child);
  }
}
const leafLength = (leaf) => (leaf.nodeName === "BR" ? 1 : leaf.nodeValue.length);

function leafStart(root, target) {
  let total = 0;
  for (const leaf of leaves(root)) {
    if (leaf === target) return total;
    total += leafLength(leaf);
  }
  return total;
}

function offsetOf(root, container, offset) {
  if (container.nodeType === Node.TEXT_NODE) return leafStart(root, container) + offset;
  if (container.nodeName === "BR") return leafStart(root, container);
  // Element boundary: the point sits before child[offset], or at the end.
  const boundary = container.childNodes[offset];
  if (boundary) {
    const first = boundary.nodeType === Node.ELEMENT_NODE && boundary.nodeName !== "BR" ? leaves(boundary).next().value : boundary;
    return first ? leafStart(root, first) : leafStart(root, [...leaves(root)].find((l) => !(container.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_PRECEDING)) || null);
  }
  const inside = [...leaves(container)];
  const last = inside[inside.length - 1];
  return last ? leafStart(root, last) + leafLength(last) : (container === root ? 0 : leafStart(root, null));
}

function pointAt(root, target) {
  let pos = 0;
  let lastText = null;
  for (const leaf of leaves(root)) {
    const length = leafLength(leaf);
    if (leaf.nodeName !== "BR" && target <= pos + length) return { node: leaf, offset: target - pos };
    if (leaf.nodeName === "BR" && target <= pos) return { node: leaf.parentNode, offset: [...leaf.parentNode.childNodes].indexOf(leaf) };
    if (leaf.nodeName !== "BR") lastText = leaf;
    pos += length;
  }
  return lastText ? { node: lastText, offset: lastText.nodeValue.length } : { node: root, offset: root.childNodes.length };
}

// Highlighted portion inside this box, or null when nothing is highlighted.
function highlightedRange(root) {
  const selection = window.getSelection?.();
  if (!selection || !selection.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  return { start: offsetOf(root, range.startContainer, range.startOffset), end: offsetOf(root, range.endContainer, range.endOffset) };
}

function readRuns(root) {
  const runs = [];
  for (const leaf of leaves(root)) {
    let color = null;
    for (let el = leaf.parentNode; el && el !== root; el = el.parentNode) {
      const css = el.style?.color && safeCssColor(el.style.color);
      if (css) { color = css; break; }
    }
    runs.push({ text: leaf.nodeName === "BR" ? "\n" : leaf.nodeValue, color });
  }
  return normalizeRuns(runs);
}

export default function RichTextBox({ id, value, onChange, selected = false, editable = true, className = "", style }) {
  const rootRef = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const commit = useCallback((next, restore) => {
    const root = rootRef.current;
    if (!root) return;
    root.innerHTML = toHtml(next);
    if (restore) {
      const a = pointAt(root, restore.start);
      const b = pointAt(root, restore.end);
      const range = document.createRange();
      range.setStart(a.node, a.offset);
      range.setEnd(b.node, b.offset);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
    onChange?.(next);
  }, [onChange]);

  // Re-render DOM only when the model changed from outside (not from typing).
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (root && JSON.stringify(readRuns(root)) !== JSON.stringify(normalizeRuns(value.runs))) root.innerHTML = toHtml(value);
  }, [value]);

  useEffect(() => registerRichTextBox(id, {
    isActive: () => selectedRef.current,
    applyColor: (color) => {
      const root = rootRef.current;
      if (!root) return false;
      // Mode 2: highlighted substring -> inline span only on that portion.
      // Mode 1: whole box selected -> uniform color, inline overrides cleared.
      const range = highlightedRange(root);
      commit(applyColor({ ...valueRef.current, runs: readRuns(root) }, color, range), range);
      return true;
    },
  }), [id, commit]);

  return (
    <div
      ref={rootRef}
      className={`sketchizi-rich-text-box ${className}`.trim()}
      style={{ ...style, color: safeCssColor(value.color) || style?.color, whiteSpace: "pre-wrap" }}
      contentEditable={editable}
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      data-sketchizi-inline-editor
      onInput={() => onChange?.({ ...valueRef.current, runs: readRuns(rootRef.current) })}
      onKeyDown={(event) => {
        if (event.key === "Enter") { event.preventDefault(); document.execCommand("insertLineBreak"); }
      }}
    />
  );
}
