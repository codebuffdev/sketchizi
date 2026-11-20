import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getTabDisplayName, MAX_TAB_LABEL_CHARACTERS } from "../src/features/workspace/tabLabel.js";

test("limit is 70 characters", () => assert.equal(MAX_TAB_LABEL_CHARACTERS, 20));

test("names shorter than 70 characters are unchanged", () => {
  assert.equal(getTabDisplayName("Canvas 1"), "Canvas 1");
  assert.equal(getTabDisplayName(""), "");
});

test("names of exactly 70 characters are unchanged", () => {
  const name = "1234567890123456789012345678901234567890123456789012345678901234567890";
  assert.equal(name.length, 20);
  assert.equal(getTabDisplayName(name), name);
});

test("names longer than 70 characters are cut to 70", () => {
  const name = "Quarterly architecture review canvas";
  const shown = getTabDisplayName(name);
  assert.equal(Array.from(shown).length, 70);
  assert.equal(shown, name.slice(0, 70));
});

test("emoji are not split in half", () => {
  const name = "😀".repeat(75);
  assert.equal(Array.from(getTabDisplayName(name)).length, 70);
});

test("truncation never mutates or shortens the stored name", () => {
  const tab = Object.freeze({ id: "t", name: "A very long canvas name that keeps going" });
  const shown = getTabDisplayName(tab.name);
  assert.notEqual(shown, tab.name);
  assert.equal(tab.name, "A very long canvas name that keeps going");
});

test("renaming a long tab keeps the full new name in state", () => {
  let tabs = [{ id: "t", name: "Canvas 1" }];
  const renamed = "Renamed to something far longer than seventy";
  tabs = tabs.map((t) => (t.id === "t" ? { ...t, name: renamed } : t));
  assert.equal(tabs[0].name, renamed);
  assert.equal(Array.from(getTabDisplayName(tabs[0].name)).length, 70);
});

test("CanvasTabs shows truncated text but keeps full name in tooltip and aria labels", () => {
  const src = readFileSync(new URL("../src/components/app/CanvasTabs.jsx", import.meta.url), "utf8");
  assert.match(src, /canvas-tab-name">\{getTabDisplayName\(tab\.name\)\}/);
  assert.match(src, /title=\{tab\.name\}/);
  assert.match(src, /aria-label=\{`Close \$\{tab\.name\}`\}/);
  const header = readFileSync(new URL("../src/components/app/DesktopAppHeader.jsx", import.meta.url), "utf8");
  assert.match(header, /setDocumentNameDraft\(activeCanvasTabName\)/, "rename starts from the full stored name");
});
