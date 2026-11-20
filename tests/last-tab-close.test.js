import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveTabClose, hasMountableCanvas } from "../src/features/workspace/tabClose.js";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const tab = (id) => ({ id, name: id });

test("closing the only tab returns to the welcome screen with no active tab", () => {
  const result = resolveTabClose({ tabs: [tab("a")], closingId: "a", activeId: "a" });
  assert.equal(result.returnToWelcome, true);
  assert.deepEqual(result.remainingTabs, []);
  assert.equal(result.nextActiveId, "");
});

test("closing the only tab works for any canvas kind (infinity or pages)", () => {
  for (const kind of ["infinite", "pages"]) {
    const tabs = [{ id: `${kind}-1`, name: kind, canvasMode: kind }];
    assert.equal(resolveTabClose({ tabs, closingId: `${kind}-1`, activeId: `${kind}-1` }).returnToWelcome, true);
  }
});

test("closing one of several tabs activates a remaining tab and keeps others", () => {
  const tabs = [tab("a"), tab("b"), tab("c")];
  const middle = resolveTabClose({ tabs, closingId: "b", activeId: "b" });
  assert.equal(middle.returnToWelcome, false);
  assert.equal(middle.nextActiveId, "a");
  assert.deepEqual(middle.remainingTabs.map((t) => t.id), ["a", "c"]);
  assert.equal(resolveTabClose({ tabs, closingId: "a", activeId: "a" }).nextActiveId, "b");
  const inactive = resolveTabClose({ tabs, closingId: "c", activeId: "a" });
  assert.equal(inactive.nextActiveId, "a", "closing a background tab must not change the active tab");
});

test("closing an unknown tab changes nothing", () => {
  const result = resolveTabClose({ tabs: [tab("a")], closingId: "zzz", activeId: "a" });
  assert.equal(result.found, false);
  assert.equal(result.returnToWelcome, false);
});

test("a stale active id never keeps the canvas mounted", () => {
  assert.equal(hasMountableCanvas({ tabs: [], activeCanvasId: "a" }), false);
  assert.equal(hasMountableCanvas({ tabs: [tab("b")], activeCanvasId: "a" }), false);
  assert.equal(hasMountableCanvas({ tabs: [tab("a")], activeCanvasId: "" }), false);
  assert.equal(hasMountableCanvas({ tabs: [tab("a")], activeCanvasId: "a" }), true);
});

test("App wiring: last close clears scene, cloud binding, active id and unmounts the canvas", () => {
  const start = app.indexOf("const returnToWelcomeScreen = useCallback");
  const end = app.indexOf("const performCloseCanvasTab", start);
  assert.ok(start > 0 && end > start, "returnToWelcomeScreen must exist before performCloseCanvasTab");
  const branch = app.slice(start, end);
  assert.match(app, /if \(remainingTabs\.length === 0\) \{\s*returnToWelcomeScreen\(\);\s*return;/, "closing the final tab must call the welcome reset");
  assert.match(branch, /updateScene\?\.\(\{\s*elements: \[\]/, "live scene must be emptied");
  assert.match(branch, /setSavedSketch\(null\)/);
  assert.match(branch, /setCurrentFile\(null\)/);
  assert.match(branch, /cloudSessionRef\.current = \{ active: false/);
  assert.ok(branch.indexOf("cloudSessionRef.current = {") < branch.indexOf("updateScene"), "detach cloud before clearing the scene");
  assert.match(branch, /activeCanvasIdRef\.current = ""/);
  assert.match(branch, /setActiveCanvasId\(""\)/);
  assert.match(branch, /handleExcalidrawAPI\(null\)/);
  assert.match(branch, /setStartupChooserOpen\(true\)/);
  assert.doesNotMatch(branch, /createCanvasTab\(/, "no replacement tab may be created automatically");
  assert.match(app, /\{canvasMounted && \(\s*<SketchiziCanvas/);
  assert.match(app, /const canvasMounted = hasMountableCanvas\(/);
});

test("welcome chooser shows even when a cloud deep link is in the URL and the API is gone", () => {
  assert.match(app, /startupChooserOpen && sketchReady && \(apiReady \|\| noOpenCanvas\) && \(!cloudDiagramId \|\| noOpenCanvas\)/);
  assert.match(app, /chooseStartupCanvas = useCallback\(\(mode\) => \{[\s\S]*canvasTabsRef\.current\.length === 0\) createCanvasTab\(\)/, "reopening from welcome creates the tab");
  assert.match(app, /chooseStartupCanvas\("infinite"\)/);
  assert.match(app, /chooseStartupCanvas\("pages"\)/);
});
