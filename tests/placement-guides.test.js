import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  calculatePlacementGuides,
  clientToScene,
  sceneToCanvasPixel,
  PLACEMENT_SNAP_TOOLS,
} from "../src/features/canvas/alignmentGuides.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const parent = { id: "parent", type: "text", x: 100, y: 100, width: 140, height: 25 };

test("flush under a text line shows Align Left and snaps X", () => {
  const result = calculatePlacementGuides([parent], { x: 104, y: 170 }, { tool: "text" });
  assert.equal(result.active, true);
  assert.equal(result.snappedX, 100);
  assert.equal(result.snappedY, 170);
  assert.equal(result.x.kind, "left");
  assert.equal(result.x.label, "Align Left");
  assert.deepEqual([result.x.start, result.x.end], [100, 170]);
});

test("+24px and +32px under a text line show the indent callout", () => {
  const a = calculatePlacementGuides([parent], { x: 126, y: 170 }, { tool: "text" });
  assert.equal(a.x.kind, "indent");
  assert.equal(a.x.label, "Indent +24px");
  assert.equal(a.snappedX, 124);
  assert.equal(a.x.parentLeft, 100);
  const b = calculatePlacementGuides([parent], { x: 130, y: 170 }, { tool: "text" });
  assert.equal(b.x.label, "Indent +32px");
  assert.equal(b.snappedX, 132);
});

test("outside the ±6px zone nothing is shown", () => {
  assert.equal(calculatePlacementGuides([parent], { x: 108, y: 170 }, { tool: "text" }).active, false);
  assert.equal(calculatePlacementGuides([parent], { x: 100, y: 170 }, { tool: "hand" }).active, false);
});

test("elements beyond the ±320px vertical window are ignored", () => {
  assert.equal(calculatePlacementGuides([parent], { x: 100, y: 100 + 25 + 400 }, { tool: "text" }).active, false);
  assert.equal(calculatePlacementGuides([parent], { x: 100, y: 100 + 25 + 300 }, { tool: "text" }).active, true);
});

test("deleted elements and container-bound text never guide", () => {
  const deleted = { ...parent, isDeleted: true };
  const bound = { ...parent, id: "bound", containerId: "box" };
  assert.equal(calculatePlacementGuides([deleted, bound], { x: 100, y: 170 }, { tool: "text" }).active, false);
});

test("line tool gets Center Y beside a label and snaps Y", () => {
  const result = calculatePlacementGuides([parent], { x: 400, y: 115 }, { tool: "line" });
  assert.equal(result.y.label, "Center Y");
  assert.equal(result.snappedY, 112.5);
  assert.equal(result.snappedX, 400);
  assert.equal(result.y.start, 100);
  assert.equal(result.y.end, 400);
});

test("text tool never gets horizontal guides", () => {
  assert.equal(calculatePlacementGuides([parent], { x: 400, y: 112 }, { tool: "text" }).y, null);
});

test("line tool aligns with polygon vertices (hexagon)", () => {
  const hexagon = { id: "hex", type: "line", x: 500, y: 300, width: 80, height: 70,
    points: [[20, 0], [60, 0], [80, 35], [60, 70], [20, 70], [0, 35], [20, 0]] };
  const vertical = calculatePlacementGuides([hexagon], { x: 583, y: 200 }, { tool: "line" });
  assert.equal(vertical.snappedX, 580);
  const horizontal = calculatePlacementGuides([hexagon], { x: 700, y: 372 }, { tool: "arrow" });
  assert.equal(horizontal.snappedY, 370);
});

test("only text, line and arrow snap on press", () => {
  assert.deepEqual([...PLACEMENT_SNAP_TOOLS].sort(), ["arrow", "line", "text"]);
});

test("client -> scene is the inverse of scene -> canvas pixel", () => {
  const appState = { scrollX: -40, scrollY: 25, zoom: { value: 2 } };
  const rect = { left: 10, top: 20 };
  const scene = clientToScene(210, 220, rect, appState);
  assert.equal(scene.zoom, 2);
  assert.equal(sceneToCanvasPixel(scene.x, appState.scrollX, 2), 200);
  assert.equal(sceneToCanvasPixel(scene.y, appState.scrollY, 2), 200);
});

test("component wires hover guides, Alt bypass, fade-out and magnetic snap", () => {
  const source = read("../src/components/app/AlignmentGuides.jsx");
  assert.match(source, /calculatePlacementGuides/);
  assert.match(source, /event\.altKey/);
  assert.match(source, /event\.key !== "Alt"/);
  assert.match(source, /editingTextElement/);
  assert.match(source, /new PointerEvent\("pointerdown"/);
  assert.match(source, /visible: false/);
});

test("ruler styling uses the specified colors and pill treatment", () => {
  const css = read("../src/styles/alignment-guides.css");
  assert.match(css, /--sk-ruler-ink: #818cf8/);
  assert.match(css, /--sk-ruler-ink: #4f46e5/);
  assert.match(css, /\.sketchizi-placement-pill[\s\S]*?padding: 2px 6px[\s\S]*?border-radius: 6px[\s\S]*?font-size: 10px[\s\S]*?backdrop-filter: blur\(6px\)/);
});
