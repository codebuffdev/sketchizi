import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { arrangeElements, applyAlignmentToSelection } from "../alignElements.js";

const box = (id, x, y, width = 40, height = 30, extra = {}) => ({
  id, type: "rectangle", x, y, width, height, version: 1, versionNonce: 1, ...extra,
});
const moved = (elements, id) => elements.find((element) => element.id === id);
const bounds = (element) => ({ left: element.x, right: element.x + element.width, top: element.y, bottom: element.y + element.height });
const centerX = (element) => element.x + element.width / 2;
const centerY = (element) => element.y + element.height / 2;

test("Horizontal Line uses 24px gaps, averages vertical centers, and preserves bound text offsets", () => {
  const scene = [
    box("a", 20, 10, 60, 40, { boundElements: [{ id: "a-label", type: "text" }] }),
    { id: "a-label", type: "text", x: 35, y: 22, width: 30, height: 16, containerId: "a", version: 1 },
    box("b", 160, 70, 40, 20),
    box("c", 260, 0, 50, 30),
  ];
  const next = arrangeElements(scene, ["a", "b", "c"], "horizontal");
  assert.equal(bounds(moved(next, "b")).left - bounds(moved(next, "a")).right, 24);
  assert.equal(bounds(moved(next, "c")).left - bounds(moved(next, "b")).right, 24);
  assert.equal(moved(next, "a-label").x - moved(next, "a").x, 15);
  assert.equal(moved(next, "a-label").y - moved(next, "a").y, 12);
  const centers = ["a", "b", "c"].map((id) => centerY(moved(next, id)));
  assert.ok(centers.every((center) => Math.abs(center - centers[0]) < 0.001));
});

test("Vertical Line uses 24px gaps and preserves group offsets", () => {
  const scene = [
    box("a", 0, 0, 40, 30, { groupIds: ["group-a"] }),
    { id: "a-label", type: "text", x: 8, y: 8, width: 24, height: 12, groupIds: ["group-a"], version: 1 },
    box("b", 100, 100, 60, 40),
    box("c", 30, 220, 30, 20),
  ];
  const next = arrangeElements(scene, ["a", "b", "c"], "vertical");
  assert.equal(bounds(moved(next, "b")).top - bounds(moved(next, "a")).bottom, 24);
  assert.equal(bounds(moved(next, "c")).top - bounds(moved(next, "b")).bottom, 24);
  assert.equal(moved(next, "a-label").x - moved(next, "a").x, 8);
  assert.equal(moved(next, "a-label").y - moved(next, "a").y, 8);
  const centers = ["a", "b", "c"].map((id) => centerX(moved(next, id)));
  assert.ok(centers.every((center) => Math.abs(center - centers[0]) < 0.001));
});

for (const layout of ["square", "rectangle"]) {
  for (const count of [4, 5, 6]) {
    test(`${layout === "square" ? "Square Grid" : "Rectangle Grid"} arranges ${count} boxes from the selection top-left with 24px cell gaps`, () => {
      const scene = [
        box("a", 120, 90, 40, 30), box("b", 240, 110, 50, 20),
        box("c", 80, 210, 30, 40), box("d", 330, 220, 60, 30),
        box("e", 190, 310, 35, 25), box("f", 400, 330, 45, 35),
      ].slice(0, count);
      const next = arrangeElements(scene, scene.map((element) => element.id), layout);
      const items = next.filter((element) => scene.some((source) => source.id === element.id));
      const columns = layout === "square" ? Math.ceil(Math.sqrt(count)) : Math.ceil(count / 2);
      const rows = Math.ceil(count / columns);
      assert.equal(Math.min(...items.map((element) => element.x)), Math.min(...scene.map((element) => element.x)));
      assert.equal(Math.min(...items.map((element) => element.y)), Math.min(...scene.map((element) => element.y)));
      const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
      const colWidths = Array.from({ length: columns }, (_, col) =>
        Math.max(...sorted.filter((_, index) => index % columns === col).map((element) => element.width)),
      );
      const rowHeights = Array.from({ length: rows }, (_, row) =>
        Math.max(...sorted.slice(row * columns, (row + 1) * columns).map((element) => element.height)),
      );
      for (let row = 0; row < rows; row += 1) {
        const cells = sorted.slice(row * columns, (row + 1) * columns);
        for (let col = 1; col < cells.length; col += 1) {
          assert.equal(cells[col].x - cells[col - 1].x, colWidths[col - 1] + 24);
        }
      }
      for (let row = 1; row < rows; row += 1) {
        const previousRow = sorted.slice((row - 1) * columns, row * columns);
        const currentRow = sorted.slice(row * columns, (row + 1) * columns);
        assert.equal(currentRow[0].y - previousRow[0].y, rowHeights[row - 1] + 24);
      }
    });
  }
}

test("standard edge alignments align logical unit bounds without detaching bound text", () => {
  const scene = [
    box("a", 10, 20, 40, 30, { boundElements: [{ id: "label", type: "text" }] }),
    { id: "label", type: "text", x: 20, y: 28, width: 20, height: 12, containerId: "a", version: 1 },
    box("b", 100, 100, 60, 40),
  ];
  const next = arrangeElements(scene, ["a", "b"], "left");
  assert.equal(moved(next, "a").x, moved(next, "b").x);
  assert.equal(moved(next, "label").x - moved(next, "a").x, 10);
});


test("live alignment reads current Excalidraw selection and commits an undoable scene update", () => {
  const scene = [box("a", 0, 0), box("b", 120, 60), box("unselected", 500, 500)];
  let update;
  const api = {
    getAppState: () => ({ selectedElementIds: { a: true, b: true, unselected: false } }),
    getSceneElements: () => scene,
    updateScene: (value) => { update = value; },
  };
  assert.equal(applyAlignmentToSelection(api, "horizontal"), true);
  assert.ok(update);
  assert.equal(update.commitToHistory, true);
  assert.equal(update.elements.find((element) => element.id === "a").x, 0);
  assert.equal(update.elements.find((element) => element.id === "b").x, 64);
  assert.equal(update.elements.find((element) => element.id === "unselected").x, 500);
});

for (const layout of ["horizontal", "vertical", "square", "rectangle"]) {
  test(`applyAlignmentToSelection sends changed coordinates to updateScene for ${layout}`, () => {
    const scene = [
      box("a", 20, 20, 30, 20),
      box("b", 180, 90, 40, 30),
      box("c", 80, 220, 35, 25),
      box("d", 300, 310, 50, 40),
    ];
    let update = null;
    const api = {
      getAppState: () => ({ selectedElementIds: Object.fromEntries(scene.map((element) => [element.id, true])) }),
      getSceneElements: () => scene,
      updateScene: (payload) => { update = payload; },
    };
    assert.equal(applyAlignmentToSelection(api, layout), true);
    assert.ok(update?.elements);
    assert.ok(update.elements.some((element, index) =>
      element.x !== scene[index].x || element.y !== scene[index].y,
    ));
  });
}

test("bound text remains centered in its parent box after the parent is arranged", () => {
  const scene = [
    box("parent-a", 0, 0, 100, 60, { boundElements: [{ id: "label-a", type: "text" }] }),
    { id: "label-a", type: "text", x: 20, y: 20, width: 60, height: 20, containerId: "parent-a", version: 1 },
    box("parent-b", 240, 120, 80, 50),
  ];
  const next = arrangeElements(scene, ["parent-a", "parent-b"], "horizontal");
  const parent = moved(next, "parent-a");
  const label = moved(next, "label-a");
  assert.equal(label.x + label.width / 2, parent.x + parent.width / 2);
  assert.equal(label.y + label.height / 2, parent.y + parent.height / 2);
});

test("ToolOptionsDock renders the minimalist Align trigger and a body-portaled upward popover", async () => {
  const source = await readFile(new URL("../../components/app/ToolOptionsDock.jsx", import.meta.url), "utf8");
  assert.match(source, /title="Align & Arrange"/);
  assert.match(source, /width="18" height="18"[^>]*strokeWidth="1\.8"/);
  assert.match(source, /M5 4v16M8 7h11M8 12h8M8 17h11/);
  assert.match(source, /document\.body,/);
  assert.match(source, /onMouseDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(source, /api\.getSceneElements\?\.\(\)/);
  assert.match(source, /selectedElementIds/);
  assert.match(source, /commitToHistory: true/);
});
