import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getNodeContentScale, BASE_NODE_WIDTH, BASE_NODE_HEIGHT } from "../nodeCardScale.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

test("node content uses the base card scale and doubles at 408×176", () => {
  assert.equal(BASE_NODE_WIDTH, 204);
  assert.equal(BASE_NODE_HEIGHT, 88);
  assert.equal(getNodeContentScale(204, 88), 1);
  assert.equal(getNodeContentScale(408, 176), 2);
  assert.equal(getNodeContentScale(612, 264), 2.75);
});

test("content scale is clamped for undersized and non-finite card dimensions", () => {
  assert.equal(getNodeContentScale(100, 44), 0.85);
  assert.equal(getNodeContentScale(0, 0), 0.85);
  assert.equal(getNodeContentScale(Number.NaN, Number.NaN), 1);
});

test("only the inner content plane scales; live node bounds and cardinal ports remain on the outer card", () => {
  const overlay = read("features/system-design/SystemDesignNodeOverlay.jsx");
  const css = read("features/system-design/systemDesign.css");
  assert.match(overlay, /getNodeContentScale\(node\.width, node\.height\)/);
  assert.match(overlay, /className="sd-node-content" style=\{\{ transform: `scale\(\$\{contentScale\}\)` \}\}/);
  assert.match(overlay, /style=\{\{ left: node\.x, top: node\.y, width: node\.width, height: node\.height \}\}/);
  assert.match(overlay, /PORTS\.map\(\(port\)/);
  assert.match(css, /\.sd-node-content\s*\{[\s\S]*?width: 204px;[\s\S]*?height: 88px;[\s\S]*?transform-origin: top left;/);
  assert.match(css, /\.sd-port\.is-top\s*\{\s*left: 50%;\s*top: -6px;/);
  assert.match(css, /\.sd-port\.is-right\s*\{\s*left: calc\(100% \+ 6px\);\s*top: 50%;/);
  assert.match(css, /\.sd-port\.is-bottom\s*\{\s*left: 50%;\s*top: calc\(100% \+ 6px\);/);
  assert.match(css, /\.sd-port\.is-left\s*\{\s*left: -6px;\s*top: 50%;/);
});
