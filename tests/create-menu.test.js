import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const menu = readFileSync(new URL("../src/components/app/CreateMenu.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/create-menu.css", import.meta.url), "utf8");
const styleEntry = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const files = readFileSync(new URL("../src/features/files/useFileManager.js", import.meta.url), "utf8");

test("Create menu prioritizes blank drawing and general-purpose templates", () => {
  const blank = menu.indexOf("Blank drawing");
  const templates = menu.indexOf("<strong>Templates</strong>");
  const advanced = menu.indexOf("Engineering tools");
  const kubernetes = menu.indexOf("<strong>Kubernetes Studio</strong>");
  const compose = menu.indexOf("<strong>Docker Compose Studio</strong>");
  assert.ok(blank >= 0 && blank < templates && templates < advanced);
  assert.ok(advanced < kubernetes && kubernetes < compose);
  assert.match(menu, /<span>Create<\/span>/);
});

test("Create menu keeps existing drawing and studio actions wired", () => {
  assert.match(app, /<CreateMenu[\s\S]*onBlankDrawing=\{\(\) => fileActionsRef\.current\.createNewFile\?\.\(\)\}/);
  assert.match(app, /onTemplates=\{\(\) => setDesignStudioOpen\(true\)\}/);
  assert.match(app, /onCloudWorkspace=\{\(\) => window\.location\.assign\("\/workspace"\)\}/);
  assert.match(app, /onKubernetesStudio=\{\(\) => setKubernetesStudioOpen\(true\)\}/);
  assert.match(app, /onDockerStudio=\{\(\) => setDockerStudioOpen\(true\)\}/);
  assert.match(files, /const createNewFile = \(\) => \{[\s\S]*confirmCanvasReplacement\("create a new drawing"\)/);
  assert.doesNotMatch(app, /devopsStudioMenuOpen|setDevopsStudioMenuOpen/);
});

test("Create menu is accessible and dismissible", () => {
  assert.match(menu, /aria-label="Create drawing"/);
  assert.match(menu, /aria-haspopup="menu"/);
  assert.match(menu, /aria-expanded=\{open\}/);
  assert.match(menu, /role="menu"/);
  assert.match(menu, /role="menuitem"/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(menu, /"ArrowDown", "ArrowUp", "Home", "End"/);
  assert.match(menu, /document\.addEventListener\("pointerdown", onPointerDown, true\)/);
  assert.match(menu, /document\.removeEventListener\("pointerdown", onPointerDown, true\)/);
  assert.match(menu, /if \(dismissWhen\) setOpen\(false\)/);
});

test("Canvas keeps its normal interaction path without a second menu listener", () => {
  assert.match(app, /<section className="desktop-canvas-region" aria-label="Canvas workspace">/);
  assert.doesNotMatch(app, /onPointerDownCapture=\{\(\) => \{ if \(devopsStudioMenuOpen\)/);
  assert.match(app, /onBeforeOpen=\{\(\) => \{/);
  assert.match(app, /if \(nativeMenuOpen\) closeNativeMenu\(\)/);
});

test("Create control is clearly labeled on desktop and compact on small screens", () => {
  assert.match(styleEntry, /@import "\.\/styles\/create-menu\.css";/);
  assert.match(styles, /min-width: 88px/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /\.sketchizi-create-menu-heading/);
});
