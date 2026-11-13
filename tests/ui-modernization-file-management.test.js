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
  assert.match(app, /currentDocumentName=\{cloudDiagramId \? cloudDocumentName : \(currentFile\?\.name \|\| "Untitled drawing"\)\}/);
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


test("canvas document names can be edited without forcing a file save", () => {
  assert.match(header, /onRenameDocument/);
  assert.match(header, /desktop-app-document-identity-name-input/);
  assert.match(header, /aria-label="Rename canvas"/);
  assert.match(app, /onRenameDocument=\{renameActiveDocument\}/);
  assert.match(fileManager, /const renameCurrentDocument = async \(requestedName\)/);
  assert.match(fileManager, /file\.handle\.move\(targetName\)/);
  assert.match(fileManager, /setCurrentFile\(renamedFile, baseline\)/);
});

test("cloud canvas rename persists through the existing workspace metadata endpoint", () => {
  const workspaceClient = readFileSync(new URL("../src/features/workspace/workspaceClient.js", import.meta.url), "utf8");
  assert.match(app, /workspaceClient\.updateDiagram\(cloudDiagramId, \{ name: normalizedName \}\)/);
  assert.match(app, /setCloudDocumentName\(savedName\)/);
  assert.match(workspaceClient, /updateDiagram: \(diagramId, metadata\) => request\([^\n]+method: "PATCH"/);
});


test("saved file exposes distinct Save and Save As actions", () => {
  assert.match(app, /onSaveAs=\{\(\) => fileActionsRef\.current\.saveDrawingAs\?\.\(\)\}/);
  assert.match(header, /currentDocumentFileBacked \? "Save" : "Save to file…"/);
  assert.match(header, /currentDocumentFileBacked && <button[^>]+onSaveAs/);
});
