import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("node cards switch density tiers at the requested live dimensions", () => {
  const overlay = read("features/system-design/SystemDesignNodeOverlay.jsx");
  assert.match(overlay, /node\.width >= 340 && node\.height >= 165 \? "hero"/);
  assert.match(overlay, /node\.width >= 250 && node\.height >= 115 \? "medium"/);
  assert.match(overlay, /className=\{\"sd-node-content is-\" \+ density\}/);
});

test("card content reflows at native scale with compact, medium, and hero structures", () => {
  const overlay = read("features/system-design/SystemDesignNodeOverlay.jsx");
  const css = read("features/system-design/systemDesign.css");
  assert.doesNotMatch(overlay, /getNodeContentScale|transform:\s*\x60scale/);
  assert.match(css, /\.sd-node-content\s*\{[\s\S]*?width: 100%;[\s\S]*?height: 100%;[\s\S]*?display: flex;[\s\S]*?overflow: hidden;/);
  assert.match(css, /padding: clamp\(10px, 4%, 18px\)/);
  assert.match(css, /\.sd-node-content\.is-medium[\s\S]*?font-size: 15px/);
  assert.match(css, /\.sd-node-content\.is-hero[\s\S]*?font-size: 17px/);
  assert.match(css, /\.sd-node-telemetry\s*\{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
});

test("connector ports remain positioned on the outer live node bounds", () => {
  const overlay = read("features/system-design/SystemDesignNodeOverlay.jsx");
  const css = read("features/system-design/systemDesign.css");
  assert.match(overlay, /style=\{\{ left: node\.x, top: node\.y, width: node\.width, height: node\.height \}\}/);
  assert.match(overlay, /PORTS\.map\(\(port\)/);
  assert.match(css, /\.sd-port\.is-top\s*\{\s*left: 50%;\s*top: -6px;/);
  assert.match(css, /\.sd-port\.is-right\s*\{\s*left: calc\(100% \+ 6px\);\s*top: 50%;/);
  assert.match(css, /\.sd-port\.is-bottom\s*\{\s*left: 50%;\s*top: calc\(100% \+ 6px\);/);
  assert.match(css, /\.sd-port\.is-left\s*\{\s*left: -6px;\s*top: 50%;/);
});
