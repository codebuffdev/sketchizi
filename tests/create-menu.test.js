import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const menu = readFileSync(new URL("../src/components/app/CreateMenu.jsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/create-menu.css", import.meta.url), "utf8");
const styleEntry = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const files = readFileSync(new URL("../src/features/files/useFileManager.js", import.meta.url), "utf8");

test("DevOps menu lists Kubernetes Studio before Docker Compose Studio", () => {
  const heading = menu.indexOf("DevOps tools");
  const kubernetes = menu.indexOf("<strong>Kubernetes Studio</strong>");
  const compose = menu.indexOf("<strong>Docker Compose Studio</strong>");
  assert.ok(heading >= 0 && heading < kubernetes && kubernetes < compose);
  assert.match(menu, /onKubernetesStudio/);
  assert.match(menu, /onDockerStudio/);
});

test("Studio actions and new-drawing confirmation stay wired", () => {
  // Studios open from the More Tools panel and from the command registry.
  assert.match(app, /onOpenKubernetesStudio=\{\(\) => \{ togglePanel\("more-tools"\); setKubernetesStudioOpen\(true\); \}\}/);
  assert.match(app, /onOpenDockerComposeStudio=\{\(\) => \{ togglePanel\("more-tools"\); setDockerStudioOpen\(true\); \}\}/);
  assert.match(app, /openKubernetesStudio: \(\) => setKubernetesStudioOpen\(true\)/);
  assert.match(app, /openDockerComposeStudio: \(\) => setDockerStudioOpen\(true\)/);
  assert.match(files, /const createNewFile = async \(\) => \{[\s\S]*confirmCanvasReplacement\("create a new drawing"\)/);
  assert.doesNotMatch(app, /devopsStudioMenuOpen|setDevopsStudioMenuOpen/);
});

test("DevOps menu is accessible and dismissible", () => {
  assert.match(menu, /aria-label="DevOps"/);
  assert.match(menu, /aria-haspopup="menu"/);
  assert.match(menu, /aria-expanded=\{open\}/);
  assert.match(menu, /role="menu"/);
  assert.match(menu, /role="menuitem"/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(menu, /"ArrowDown", "ArrowUp", "Home", "End"/);
  assert.match(menu, /window\.addEventListener\("keydown", onKeyDown, true\)/);
  assert.match(menu, /window\.removeEventListener\("keydown", onKeyDown, true\)/);
  assert.match(menu, /document\.addEventListener\("pointerdown", onPointerDown, true\)/);
  assert.match(menu, /document\.removeEventListener\("pointerdown", onPointerDown, true\)/);
  assert.match(menu, /if \(dismissWhen\) setOpen\(false\)/);
});

test("Canvas keeps its normal interaction path without a second menu listener", () => {
  assert.match(app, /<section className="desktop-canvas-region" aria-label="Canvas workspace">/);
  assert.doesNotMatch(app, /onPointerDownCapture=\{\(\) => \{ if \(devopsStudioMenuOpen\)/);
  // Opening any panel closes the native menu first.
  assert.match(app, /onBeforeOpenPanel=\{closeNativeMenu\}/);
});

test("DevOps menu styles define a compact heading and a small-screen layout", () => {
  assert.match(styles, /min-width: 88px/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /\.sketchizi-create-menu-heading/);
});

test("document identity distinguishes cloud-backed drawings from local files", () => {
  const header = readFileSync(new URL("../src/components/app/DesktopAppHeader.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles/document-location.css", import.meta.url), "utf8");
  assert.match(header, /const storageLocation = isCloudDocument \? "Cloud" : currentDocumentFileBacked \? "File" : "Browser"/);
  assert.match(header, /const documentStatusLabel = isCloudDocument/);
  assert.match(header, /cloudStatusLabels\[cloudSaveState\]/);
  assert.match(header, /className="canvas-tabs-save-status/);
  assert.match(header, /This draft is automatically saved in this browser/);
  assert.match(css, /\.desktop-app-document-location/);
  assert.match(styleEntry, /@import "\.\/styles\/document-location\.css";/);
});

test("floating header does not block context-panel close actions", () => {
  const css = readFileSync(new URL("../src/styles/canvas-first-header.css", import.meta.url), "utf8");
  assert.match(css, /\.desktop-context-region \.desktop-validation-host/);
  assert.match(css, /padding-top: calc\(68px \+ var\(--safe-top, 0px\)\)/);
  assert.doesNotMatch(css, /\.sketchizi-layers-panel/);
});
