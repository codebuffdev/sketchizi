import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeCanvasTabSnapshots } from "../src/persistence.js";

test("canvas tab persistence strips transient Excalidraw appState", () => {
  const tabs = [{
    id: "canvas-1",
    snapshot: {
      elements: [{ id: "shape-1" }],
      appState: {
        viewBackgroundColor: "#fff",
        zoom: { value: 1.5 },
        selectedElementIds: { "shape-1": true },
        openMenu: "canvas",
        collaborators: new Map([["user-1", {}]]),
      },
    },
  }];
  const [saved] = sanitizeCanvasTabSnapshots(tabs);
  assert.deepEqual(saved.snapshot.appState, { viewBackgroundColor: "#fff", zoom: { value: 1.5 } });
  assert.deepEqual(saved.snapshot.elements, tabs[0].snapshot.elements);
  assert.equal(tabs[0].snapshot.appState.openMenu, "canvas", "sanitizing must not mutate the live tab");
});
