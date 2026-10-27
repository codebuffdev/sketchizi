import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../src/components/app/DesktopAppHeader.jsx", import.meta.url), "utf8");
const fileManager = readFileSync(new URL("../src/features/files/useFileManager.js", import.meta.url), "utf8");
const scene = readFileSync(new URL("../src/features/canvas/useExcalidrawScene.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/document-save-status.css", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("header shows current document identity and a distinct unsaved-to-file state", () => {
  assert.match(app, /currentDocumentName=\{currentFile\?\.name \|\| "Untitled drawing"\}/);
  assert.match(app, /currentDocumentDirty=\{documentDirty\}/);
  assert.match(app, /currentDocumentFileBacked=\{Boolean\(currentFile\?\.handle\)\}/);
  assert.match(header, /desktop-app-document-identity/);
  assert.match(header, /Changes not saved to file/);
  assert.match(header, /Linked file/);
  assert.match(header, /Local canvas/);
});

test("file edits are tracked against the last opened or successfully saved scene", () => {
  assert.match(fileManager, /function getLiveSceneSignature\(elements\)/);
  assert.match(fileManager, /Math\.imul\(first \^ code, 16777619\)/);
  assert.match(fileManager, /currentFileSceneSignatureRef\.current = file/);
  assert.match(fileManager, /signature !== currentFileSceneSignatureRef\.current/);
  assert.match(fileManager, /updateDocumentDirty\(false\)/);
  assert.match(fileManager, /localStorage\.setItem\("sketchizi-current-file-scene-signature"/);
  assert.match(fileManager, /localStorage\.getItem\("sketchizi-current-file-scene-signature"/);
  assert.match(fileManager, /sketchizi-current-file-meta/);
  assert.match(scene, /onDocumentSceneChange\(effectiveElements\)/);
  assert.match(app, /onDocumentSceneChange: markCurrentDocumentChanged/);
});

test("fallback folder files can be reopened with a writable handle when supported", () => {
  assert.match(fileManager, /if \(getFileSystemSupport\(\)\.open\) \{[\s\S]*pickDrawingToOpen\(\)/);
  assert.match(fileManager, /handle\.name !== fileEntry\.file\.name/);
  assert.match(fileManager, /registerFile\(handle, name, loadedSignature, Date\.now\(\)\)/);
  assert.match(fileManager, /changes can be saved to the original file/);
  assert.match(fileManager, /setCurrentFile\(\{ id: null, name: fileEntry\.file\.name, handle: null, fallback: true \}/);
});

test("read-only folder fallback clearly offers Save As without changing the source", () => {
  assert.match(fileManager, /readOnlySource: true/);
  assert.match(fileManager, /Read-only copy opened:[\s\S]*Use Save to… to save an editable copy; the original will not be changed/);
  assert.match(fileManager, /if \(!file\?\.handle\)[\s\S]*return saveDrawingAs\(\)/);
  assert.match(readFileSync(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8"), /Read-only · Save As/);
  assert.match(readFileSync(new URL("../src/styles/responsive-menu.css", import.meta.url), "utf8"), /\.sketchizi-folder-file-status/);
});

test("new/open transitions warn before replacing an unsaved or browser-local working canvas", () => {
  assert.match(fileManager, /const confirmCanvasReplacement = \(actionLabel\)/);
  assert.match(fileManager, /window\.confirm\(\`\$\{reason\}/);
  assert.match(fileManager, /Continuing may replace the current browser-local autosave/);
  assert.match(fileManager, /confirmCanvasReplacement\("create a new drawing"\)/);
  assert.ok((fileManager.match(/confirmCanvasReplacement\(`open/g) || []).length >= 4,
    "expected guards in disk, folder, and recent-file open paths");
});

test("document identity remains compact and responds to light/dark and mobile layouts", () => {
  assert.match(styles, /\.desktop-app-document-identity-name[\s\S]*text-overflow: ellipsis/);
  assert.match(styles, /\.app\.theme-dark \.desktop-app-document-identity/);
  assert.match(styles, /@media \(max-width: 1280px\) and \(min-width: 1025px\)/);
  assert.match(styles, /@media \(max-width: 700px\)/);
});

test("file-management regression test is part of the UI modernization suite", () => {
  assert.match(packageJson.scripts["test:ui-modernization"], /tests\/ui-modernization-file-management\.test\.js/);
});
