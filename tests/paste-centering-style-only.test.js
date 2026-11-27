import test from "node:test";
import assert from "node:assert/strict";
import { boundsOf, centerElements, centeringDelta, createPasteStagger, viewportCenterScene, STAGGER_PX } from "../src/features/canvas/pasteCentering.js";
import { commitStyleScene, isGeometryPreservingPatch, restoreGeometry } from "../src/features/canvas/styleOnlyUpdate.js";
import { applyColorToElement } from "../src/features/canvas/textRuns.js";

const state = { width: 1000, height: 600, scrollX: -400, scrollY: 250, zoom: { value: 2 } };
test("viewport center in scene space follows pan and zoom", () => {
  assert.deepEqual(viewportCenterScene(state), { cx: 1000 / 2 / 2 + 400, cy: 600 / 2 / 2 - 250 });
  assert.deepEqual(viewportCenterScene({ width: 800, height: 600, scrollX: 0, scrollY: 0, zoom: { value: 1 } }), { cx: 400, cy: 300 });
});
test("pasted group is centered on the viewport center", () => {
  const text = { id: "t", type: "text", x: 0, y: 0, width: 300, height: 25, text: "This should appear in the middle of the canvas" };
  const [moved] = centerElements([text], state);
  const c = viewportCenterScene(state);
  assert.equal(moved.x, c.cx - 150);
  assert.equal(moved.y, c.cy - 12.5);
  assert.notEqual(moved, text); assert.equal(text.x, 0); // new object, original untouched
  const group = [{ x: 10, y: 10, width: 100, height: 40 }, { x: 210, y: 110, width: 100, height: 40 }];
  const b = boundsOf(group);
  const { dx, dy } = centeringDelta(b, { cx: 0, cy: 0 });
  assert.equal(b.minX + dx + b.width / 2, 0); assert.equal(b.minY + dy + b.height / 2, 0);
});
test("stagger +20px only for identical repeats without camera movement", () => {
  const s = createPasteStagger();
  assert.equal(s.next("a", state), 0);
  assert.equal(s.next("a", state), STAGGER_PX);
  assert.equal(s.next("a", state), STAGGER_PX * 2);
  assert.equal(s.next("a", { ...state, scrollX: 0 }), 0); // camera moved
  assert.equal(s.next("b", { ...state, scrollX: 0 }), 0); // different content
});
test("pure style patches pin geometry; font changes do not", () => {
  assert.equal(isGeometryPreservingPatch(["strokeColor"]), true);
  assert.equal(isGeometryPreservingPatch(["strokeColor", "customData"]), true);
  assert.equal(isGeometryPreservingPatch(["fontSize"]), false);
  const before = { id: "a", x: 120, y: -40, width: 200, height: 30, angle: 0.2, strokeColor: "#000" };
  const drifted = { ...before, x: 0, y: 0, width: 1, strokeColor: "#f00" };
  const fixed = restoreGeometry(before, drifted);
  assert.deepEqual([fixed.x, fixed.y, fixed.width, fixed.height, fixed.angle, fixed.strokeColor], [120, -40, 200, 30, 0.2, "#f00"]);
});
test("commitStyleScene keeps position and camera even if the scene update drifts them", () => {
  const el = { id: "a", type: "text", x: 120, y: -40, width: 200, height: 30, angle: 0, originalText: "text hello", text: "text hello", strokeColor: "#E05252" };
  let scene = [el];
  let app = { scrollX: -400, scrollY: 250, zoom: { value: 2 } };
  const api = {
    getAppState: () => app, getSceneElementsIncludingDeleted: () => scene, getSceneElements: () => scene,
    updateScene: ({ elements, appState }) => { if (elements) { scene = elements; app = { ...app, scrollX: 0, scrollY: 0 }; } if (appState) app = { ...app, ...appState }; },
  };
  const patch = applyColorToElement(el, "#2563EB", { start: 5, end: 10 });
  commitStyleScene(api, { elements: [{ ...el, ...patch, x: 0, y: 0 }], patchKeys: ["strokeColor", "customData"], neverCapture: "NEVER" });
  assert.deepEqual([scene[0].x, scene[0].y, scene[0].width], [120, -40, 200]);
  assert.deepEqual([app.scrollX, app.scrollY, app.zoom.value], [-400, 250, 2]);
  assert.equal(scene[0].customData.runs[1].color, "#2563eb");
});
