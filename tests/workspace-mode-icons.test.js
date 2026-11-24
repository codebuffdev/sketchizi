import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("workspace mode icons use the specified 15px outline SVG geometry", () => {
  const source = read("../src/features/workspace/WorkspaceModeIcon.jsx");
  assert.match(source, /width="15"\s+height="15"\s+viewBox="0 0 24 24"/);
  assert.match(source, /strokeWidth: 1\.95/);
  assert.match(source, /strokeWidth: 1\.9/);
  assert.match(source, /M18\.178 8c5\.096 0 5\.096 8 0 8-5\.095 0-7\.133-8-12\.739-8-4\.585 0-4\.585 8 0 8 5\.606 0 7\.644-8 12\.74-8z/);
  assert.match(source, /M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z/);
  assert.match(source, /M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z/);
  assert.match(source, /M9 6\.5h4\.5a2 2 0 0 1 2 2V14/);
});

test("workspace icons have slate light/dark colors and emerald System Design colors", () => {
  const styles = read("../src/styles/canvas-tabs.css");
  assert.match(styles, /workspace-mode-icon--canvas,.workspace-mode-icon--pages \{ color:#334155; \}/);
  assert.match(styles, /workspace-mode-icon--system-design \{ color:#059669; \}/);
  assert.match(styles, /workspace-mode-icon--canvas,.workspace-mode-icon--pages \{ color:#cbd5e1; \}/);
  assert.match(styles, /workspace-mode-icon--system-design \{ color:#34d399; \}/);
  assert.doesNotMatch(styles, /--ct-accent:\s*#[67][0-9a-f]{5}/i);
});

test("tabs, hamburger workspace tiles, and page creation share the mode glyphs", () => {
  const tabs = read("../src/components/app/CanvasTabs.jsx");
  const menu = read("../src/features/navigation/useNativeSketchiziMenu.js");
  const pages = read("../src/features/pages/CanvasPages.jsx");
  assert.match(tabs, /WorkspaceModeIcon/);
  assert.match(tabs, /tab\.type/);
  assert.match(menu, /getWorkspaceModeIconMarkup\("canvas"\)/);
  assert.match(menu, /getWorkspaceModeIconMarkup\("pages"\)/);
  assert.match(pages, /WorkspaceModeIcon mode="pages"/);
});
