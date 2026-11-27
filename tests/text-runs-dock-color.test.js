import test from "node:test";
import assert from "node:assert/strict";
import { applyColorToElement, getElementRuns, withoutRuns } from "../src/features/canvas/textRuns.js";

const el = { type: "text", originalText: "text hello", text: "text hello", strokeColor: "#E05252", customData: undefined };
test("recoloring a highlighted word twice keeps the rest and returns new objects", () => {
  const a = applyColorToElement(el, "#2563EB", { start: 5, end: 10 });
  const b = { ...el, ...a };
  assert.deepEqual(getElementRuns(b), [{ text: "text " }, { text: "hello", color: "#2563eb" }]);
  const c = applyColorToElement(b, "#16A34A", { start: 5, end: 10 });
  assert.notEqual(c.customData, a.customData);
  assert.deepEqual(getElementRuns({ ...b, ...c }), [{ text: "text " }, { text: "hello", color: "#16a34a" }]);
});
test("whole-box recolor clears per-run overrides", () => {
  const b = { ...el, ...applyColorToElement(el, "#2563EB", { start: 5, end: 10 }) };
  assert.equal(getElementRuns(withoutRuns({ ...b, strokeColor: "#000" })).length, 0);
});
