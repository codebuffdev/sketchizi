import test from "node:test";
import assert from "node:assert/strict";
import {
  PADDING_X, PADDING_Y, computeContainerFit, getContainerIdOf, getTextSignature, planContainerExpansion, remapAttachedPoint,
} from "../src/features/canvas/containerAutoExpand/containerFit.js";

// 8px per character, lineHeight 1.25 -> deterministic stand-in for canvas metrics.
const measure = ({ text, fontSize, lineHeight }) => {
  const lines = text.split("\n");
  return { width: Math.max(...lines.map((line) => line.length)) * 8, height: lines.length * fontSize * lineHeight };
};

const rect = (over = {}) => ({
  id: "box", type: "rectangle", x: 100, y: 100, width: 120, height: 60, angle: 0, version: 1,
  boundElements: [{ id: "label", type: "text" }], ...over,
});
const label = (text, over = {}) => ({
  id: "label", type: "text", containerId: "box", text, originalText: text, fontSize: 20, fontFamily: 5,
  lineHeight: 1.25, textAlign: "center", x: 0, y: 0, width: 0, height: 0, angle: 0, version: 1, ...over,
});
const apply = (elements, patches) => elements.map((el) => (patches.has(el.id) ? { ...el, ...patches.get(el.id) } : el));
const plan = (elements, extra = {}) => planContainerExpansion({ elements, containerIds: ["box"], measure, ...extra });

test("padding is 16 x 12 and the box grows to wrap the text (center anchor)", () => {
  assert.deepEqual([PADDING_X, PADDING_Y], [16, 12]);
  const elements = [rect(), label("A fairly long label")]; // 19 chars -> 152 x 25
  const next = apply(elements, plan(elements));
  const box = next[0];
  assert.equal(box.width, 152 + 32);
  assert.equal(box.height, 60); // 25 + 24 = 49 < min height 60
  assert.equal(box.x, 100 - (184 - 120) / 2); // symmetric around centerX
  const text = next[1];
  assert.equal(text.x, box.x + (box.width - 152) / 2);
  assert.equal(text.y, box.y + (box.height - 25) / 2);
});

test("height grows with extra lines and font size", () => {
  let elements = [rect(), label("one\ntwo\nthree")]; // 3 lines * 25 = 75 -> 99
  assert.equal(apply(elements, plan(elements))[0].height, 75 + 24);
  elements = [rect(), label("one", { fontSize: 60 })]; // 75 high
  assert.equal(apply(elements, plan(elements))[0].height, 75 + 24);
});

test("shrinks back only down to the original (floor) size", () => {
  let elements = apply([rect(), label("A fairly long label")], plan([rect(), label("A fairly long label")]));
  assert.equal(elements[0].width, 184);
  elements = apply(elements, plan([elements[0], { ...elements[1], text: "Hi", originalText: "Hi" }]));
  assert.equal(elements[0].width, 120); // floor = size before expansion
  assert.equal(elements[0].height, 60);
  assert.equal(elements[0].x, 100); // symmetric shrink returns to the start
});

test("a manual resize becomes the new floor", () => {
  let elements = apply([rect(), label("A fairly long label")], plan([rect(), label("A fairly long label")]));
  elements[0] = { ...elements[0], width: 300, height: 90 }; // user drags the handles
  elements = apply(elements, plan([elements[0], { ...elements[1], text: "Hi", originalText: "Hi" }]));
  assert.equal(elements[0].width, 300);
  assert.equal(elements[0].height, 90);
  assert.equal(elements[0].customData.autoFit.minWidth, 300);
});

test("anchor follows text alignment: left grows right, right grows left", () => {
  const left = apply([rect(), label("A fairly long label", { textAlign: "left" })], plan([rect(), label("A fairly long label", { textAlign: "left" })]))[0];
  assert.equal(left.x, 100);
  assert.equal(left.y, 100);
  const right = apply([rect(), label("A fairly long label", { textAlign: "right" })], plan([rect(), label("A fairly long label", { textAlign: "right" })]))[0];
  assert.equal(right.x + right.width, 220);
});

test("ellipse and diamond reserve room for their inscribed text area", () => {
  const ellipse = computeContainerFit({ container: rect({ type: "ellipse" }), textWidth: 100, textHeight: 25, minWidth: 10, minHeight: 10 });
  assert.equal(ellipse.width, Math.ceil((100 + 32) * Math.SQRT2));
  const diamond = computeContainerFit({ container: rect({ type: "diamond" }), textWidth: 100, textHeight: 25, minWidth: 10, minHeight: 10 });
  assert.equal(diamond.width, (100 + 32) * 2);
});

test("rotated containers keep their centre fixed", () => {
  const container = rect({ angle: Math.PI / 6 });
  const fit = computeContainerFit({ container, textWidth: 300, textHeight: 25, textAlign: "left", minWidth: 120, minHeight: 60 });
  assert.equal(fit.x + fit.width / 2, container.x + container.width / 2);
});

test("stale wrap breaks are cleaned unless the text is being edited", () => {
  const wrapped = label("hello world", { text: "hello\nworld" });
  assert.equal(plan([rect(), wrapped]).get("label").text, "hello world");
  assert.equal(plan([rect(), wrapped], { editingTextId: "label" }).get("label").text, undefined);
});

test("live editor text is measured instead of the scene text", () => {
  const elements = [rect(), label("hi")];
  const patches = plan(elements, { liveTextById: new Map([["label", "a much longer live value"]]) });
  assert.equal(patches.get("box").width, 24 * 8 + 32);
});

test("bound arrow endpoints stay on the resized border", () => {
  const arrow = {
    id: "arrow", type: "arrow", x: 220, y: 130, width: 100, height: 0, points: [[0, 0], [100, 0]], version: 1,
    startBinding: { elementId: "box", focus: 0, gap: 0 }, endBinding: null,
  };
  const elements = [rect(), label("A fairly long label"), arrow];
  const next = apply(elements, plan(elements));
  const box = next[0];
  const patched = next[2];
  assert.equal(patched.x, box.x + box.width); // start still on the right edge
  assert.equal(patched.y, box.y + box.height / 2); // ...and still mid-height
  assert.equal(patched.x + patched.points[1][0], 320); // free end did not move
});

test("remapAttachedPoint handles rotation and degenerate boxes", () => {
  const moved = remapAttachedPoint({ x: 220, y: 130 }, { x: 100, y: 100, width: 120, height: 60 }, { x: 80, y: 100, width: 160, height: 60 });
  assert.deepEqual(moved, { x: 240, y: 130 });
  assert.ok(Number.isFinite(remapAttachedPoint({ x: 1, y: 1 }, { x: 0, y: 0, width: 0, height: 0 }, { x: 0, y: 0, width: 10, height: 10 }).x));
});

test("no-op when the text already fits, and unrelated shapes are ignored", () => {
  const first = apply([rect(), label("Hi")], plan([rect(), label("Hi")]));
  assert.equal(plan(first).size, 0);
  assert.equal(plan([rect({ boundElements: [] }), label("x")]).size, 0);
  assert.equal(plan([rect({ type: "frame" }), label("x")]).size, 0);
});

test("container lookup and signatures", () => {
  const box = rect();
  const text = label("x");
  const byId = new Map([[box.id, box], [text.id, text]]);
  assert.equal(getContainerIdOf(text, byId), "box");
  assert.equal(getContainerIdOf(box, byId), "box");
  assert.equal(getContainerIdOf({ id: "loose", type: "text", containerId: null }, byId), null);
  assert.notEqual(getTextSignature(text), getTextSignature({ ...text, fontSize: 28 }));
  assert.notEqual(getTextSignature(text), getTextSignature(text, "typing"));
});
