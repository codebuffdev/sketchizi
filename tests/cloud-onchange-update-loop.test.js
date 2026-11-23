import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readAppSourceSync } from "./helpers/app-source.js";

const app = readAppSourceSync();

// Excalidraw calls onChange from componentDidUpdate. Any unconditional state
// write in that path, combined with an onChange prop whose identity depends on
// that state, re-renders Excalidraw and re-fires onChange until React throws #185.

test("cloud save status updates bail out when the status is unchanged", () => {
  assert.doesNotMatch(app, /setCloudSaveState\(\(current\) => \(\{ \.\.\.current, state: "pending", error: "" \}\)\)/);
  assert.doesNotMatch(app, /setCloudSaveState\(\(current\) => \(\{ \.\.\.current, state: "saving", error: "" \}\)\)/);
  assert.match(app, /current\.state === "pending" && !current\.error \? current :/);
  assert.match(app, /current\.state === "saving" && !current\.error \? current :/);
});

test("captureCanvasTabSnapshot does not depend on volatile UI state", () => {
  const match = app.match(/const captureCanvasTabSnapshot = useCallback\([\s\S]*?\n  \}, \[([^\]]*)\]\);/);
  assert.ok(match, "captureCanvasTabSnapshot definition not found");
  const deps = match[1];
  for (const volatile of ["cloudSaveState", "cloudDocumentName", "documentDirty"]) {
    assert.ok(!deps.includes(volatile), `${volatile} must not be a dependency`);
  }
});

test("the bail-out updater returns the same reference for repeated pending updates", () => {
  const update = (current) => (current.state === "pending" && !current.error ? current : { ...current, state: "pending", error: "" });
  const first = update({ state: "saved", error: "" });
  assert.equal(first.state, "pending");
  assert.equal(update(first), first);
});
