import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RECENT_CUSTOM_COLORS_KEY,
  addRecentCustomColor,
  normalizeRecentCustomColors,
} from "../src/features/navigation/recentCustomColors.js";

const PRESETS = ["#1e1e1e", "#7c828d", "#e05252", "#d9820b", "#3a9663", "#2b79c2", "#ffffff"];
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("recent custom colors use the documented storage key", () => {
  assert.equal(RECENT_CUSTOM_COLORS_KEY, "sketchizi.recentCustomColors");
});

test("normalize keeps valid unique hex colors, lowercased, max 2", () => {
  assert.deepEqual(normalizeRecentCustomColors(["#C026D3", "#c026d3", "nope", "#112233", "#445566"]), ["#c026d3", "#112233"]);
  assert.deepEqual(normalizeRecentCustomColors("garbage"), []);
});

test("adding a custom color prepends, dedupes and caps at 2", () => {
  let list = [];
  list = addRecentCustomColor(list, "#c026d3", { presets: PRESETS });
  list = addRecentCustomColor(list, "#112233", { presets: PRESETS });
  list = addRecentCustomColor(list, "#445566", { presets: PRESETS });
  assert.deepEqual(list, ["#445566", "#112233"]);
  list = addRecentCustomColor(list, "#112233", { presets: PRESETS });
  assert.deepEqual(list, ["#112233", "#445566"]);
});

test("preset colors and invalid values are never stored", () => {
  const list = ["#c026d3"];
  assert.equal(addRecentCustomColor(list, "#E05252", { presets: PRESETS }), list);
  assert.equal(addRecentCustomColor(list, "red", { presets: PRESETS }), list);
});

test("a drag inside one picker session replaces the head instead of evicting older colors", () => {
  let list = addRecentCustomColor([], "#aa0000", { presets: PRESETS });
  list = addRecentCustomColor(list, "#c026d3", { presets: PRESETS });          // new session
  list = addRecentCustomColor(list, "#c026d4", { presets: PRESETS, replaceHead: true });
  list = addRecentCustomColor(list, "#c026d5", { presets: PRESETS, replaceHead: true });
  assert.deepEqual(list, ["#c026d5", "#aa0000"]);
});

test("preferences hook re-exports the recent custom color API", () => {
  const source = read("../src/features/navigation/useSketchiziPreferences.js");
  assert.match(source, /useRecentCustomColors/);
  assert.match(source, /recentCustomColors\.js/);
  assert.match(source, /useRecentCustomColors\.js/);
});

test("dock renders recent custom swatches before the picker and keeps the 7 presets", () => {
  const dock = read("../src/components/app/ToolOptionsDock.jsx");
  assert.match(dock, /const COLORS = \["#1e1e1e", "#7c828d", "#e05252", "#d9820b", "#3a9663", "#2b79c2", "#ffffff"\]/);
  assert.match(dock, /<RecentCustomSwatches[\s\S]{0,200}\/>\s*<ColorPicker label="Custom stroke color"/);
  assert.match(dock, /title="Custom color \(click to pick\)"/);
  assert.match(dock, /is-rainbow/);
});

test("swatch CSS never darkens on hover and uses the scale + ring treatment", () => {
  const polish = read("../src/styles/contextual-dock-polish.css");
  const hover = polish.match(/button\.sk-tool-color-dot:hover[^{]*\{([^}]*)\}/);
  assert.ok(hover, "dock swatch hover rule exists");
  assert.match(hover[1], /transform: scale\(1\.18\)/);
  assert.match(hover[1], /background: var\(--tool-color\) !important/);
  assert.match(hover[1], /filter: none !important/);
  assert.doesNotMatch(hover[1], /brightness|opacity: 0?\.\d/);
  const active = polish.match(/button\.sk-tool-color-dot\.is-active,[^{]*\{([^}]*)\}/);
  assert.ok(active, "dock selected rule exists");
  assert.match(active[1], /transform: scale\(1\.12\)/);
  assert.match(active[1], /0 0 0 2px var\(--sk-swatch-surface\), 0 0 0 4px var\(--sk-swatch-ring\)/);
  assert.match(polish, /--sk-swatch-ring: #818cf8/);
  assert.match(polish, /--sk-swatch-ring: #6965db/);
});
