import { useEffect, useState } from "react";
import { findGrammarIssues } from "./grammarSuggestions.js";

const EDITABLE_SELECTOR = ".excalidraw [contenteditable='true'], .excalidraw textarea";

function readField(field) {
  return field?.value ?? field?.innerText ?? field?.textContent ?? "";
}

function replaceContentEditableText(field, start, end, replacement) {
  const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT);
  const nodes = [];
  let node;
  let offset = 0;
  while ((node = walker.nextNode())) {
    const length = node.nodeValue.length;
    nodes.push({ node, start: offset, end: offset + length });
    offset += length;
  }
  const first = nodes.find((entry) => start >= entry.start && start <= entry.end);
  const last = nodes.find((entry) => end >= entry.start && end <= entry.end);
  if (!first || !last) return false;
  const range = document.createRange();
  range.setStart(first.node, start - first.start);
  range.setEnd(last.node, end - last.start);
  range.deleteContents();
  const inserted = document.createTextNode(replacement);
  range.insertNode(inserted);
  range.setStartAfter(inserted);
  range.collapse(true);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: replacement }));
  return true;
}

export default function CanvasGrammarAssistant() {
  const [activeField, setActiveField] = useState(null);
  const [issue, setIssue] = useState(null);
  const [dismissed, setDismissed] = useState(new Set());

  useEffect(() => {
    const inspect = (event) => {
      const field = event.target?.closest?.(EDITABLE_SELECTOR);
      if (!field) return;
      const issues = findGrammarIssues(readField(field));
      const next = issues.find((item) => !dismissed.has(item.start + ":" + item.end + ":" + item.suggestion));
      setActiveField(field);
      setIssue(next || null);
    };
    const clear = (event) => {
      if (!event.target?.closest?.(EDITABLE_SELECTOR)) {
        setActiveField(null);
        setIssue(null);
      }
    };
    document.addEventListener("focusin", inspect, true);
    document.addEventListener("input", inspect, true);
    document.addEventListener("keyup", inspect, true);
    document.addEventListener("click", clear, true);
    return () => {
      document.removeEventListener("focusin", inspect, true);
      document.removeEventListener("input", inspect, true);
      document.removeEventListener("keyup", inspect, true);
      document.removeEventListener("click", clear, true);
    };
  }, [dismissed]);

  const dismiss = () => {
    if (!issue) return;
    setDismissed((current) => new Set(current).add(issue.start + ":" + issue.end + ":" + issue.suggestion));
    const issues = findGrammarIssues(readField(activeField));
    setIssue(issues.find((item) => item !== issue) || null);
  };

  const apply = () => {
    if (!activeField || !issue) return;
    const current = readField(activeField);
    if (current.slice(issue.start, issue.end) !== issue.original) {
      setIssue(null);
      return;
    }
    activeField.focus();
    if ("setRangeText" in activeField) {
      activeField.setRangeText(issue.suggestion, issue.start, issue.end, "end");
      activeField.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertReplacementText", data: issue.suggestion }));
    } else {
      replaceContentEditableText(activeField, issue.start, issue.end, issue.suggestion);
    }
    setDismissed(new Set());
    const updated = current.slice(0, issue.start) + issue.suggestion + current.slice(issue.end);
    setIssue(findGrammarIssues(updated)[0] || null);
  };

  if (!issue || !activeField?.isConnected) return null;
  return (
    <aside className="canvas-grammar-assistant" role="status" aria-live="polite">
      <div className="canvas-grammar-heading"><span>Writing suggestion</span><button type="button" onClick={() => { setIssue(null); setActiveField(null); }} aria-label="Close writing suggestions">×</button></div>
      <div className="canvas-grammar-kind">{issue.kind} · {issue.message}</div>
      <div className="canvas-grammar-comparison"><del>{issue.original || "End of sentence"}</del><span aria-hidden="true">→</span><strong>{issue.suggestion}</strong></div>
      <div className="canvas-grammar-actions"><button type="button" className="canvas-grammar-ignore" onClick={dismiss}>Ignore</button><button type="button" className="canvas-grammar-apply" onClick={apply}>Apply suggestion</button></div>
    </aside>
  );
}
