import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");

test("repository picker dialog exposes its instructions as a description", () => {
  assert.match(menu, /role="dialog" aria-modal="true" aria-labelledby="sketchizi-repository-picker-title" aria-describedby="sketchizi-repository-picker-hint"/);
  assert.match(menu, /id="sketchizi-repository-picker-hint" class="sketchizi-repository-picker-hint"/);
});

test("repository loading state is announced through aria-busy and cleared after success", () => {
  assert.match(menu, /data-repository-picker-list role="list" aria-busy="true"/);
  assert.match(menu, /const repositories = Array\.isArray\(payload\.repositories\) \? payload\.repositories : \[\];\s*list\.setAttribute\("aria-busy", "false"\);/);
});

test("repository loading failure clears busy state and keeps the error visible", () => {
  assert.match(menu, /catch \(error\) \{\s*list\.setAttribute\("aria-busy", "false"\);\s*list\.textContent = error\.message \|\| "Could not load GitHub repositories\.";/);
  assert.match(menu, /data-repository-picker-message role="status" aria-live="polite" aria-atomic="true"/);
});
