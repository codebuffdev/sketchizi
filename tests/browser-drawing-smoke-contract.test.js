import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const script = readFileSync(new URL("../scripts/browser-drawing-smoke.mjs", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/production-build.yml", import.meta.url), "utf8");

test("production verification exercises native canvas drawing and persistence", () => {
  assert.match(script, /keyboard\.press\("r"\)/);
  assert.match(script, /mouse\.down\(\)/);
  assert.match(script, /mouse\.move\(x \+ 115, y \+ 75, \{ steps: 12 \}\)/);
  assert.match(script, /indexedDB\.open\("sketchizi-local-state"\)/);
  assert.match(script, /objectStore\("documents"\)\.get\("main"\)/);
  assert.match(script, /keyboard\.press\("v"\)/);
  assert.match(script, /keyboard\.press\("g"\)/);
  assert.match(script, /page\.reload\(/);
  assert.match(script, /sketchizi-alignment-guides line/);
});

test("drawing smoke runs after production build without bypassing existing browser smoke", () => {
  const build = workflow.indexOf("run: npm run build");
  const creation = workflow.indexOf("run: node scripts/browser-smoke.mjs");
  const drawing = workflow.indexOf("run: node scripts/browser-drawing-smoke.mjs");
  const gate = workflow.indexOf("name: Enforce regression suite result");
  assert.ok(build >= 0 && creation > build && drawing > creation && gate > drawing);
});
