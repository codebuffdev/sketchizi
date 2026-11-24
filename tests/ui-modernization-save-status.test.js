import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../src/components/app/DesktopAppHeader.jsx", import.meta.url), "utf8");
const tabs = readFileSync(new URL("../src/components/app/CanvasTabs.jsx", import.meta.url), "utf8");
const tabStyles = readFileSync(new URL("../src/styles/canvas-tabs.css", import.meta.url), "utf8");
const persistence = readFileSync(new URL("../src/features/persistence/useSketchPersistence.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/document-save-status.css", import.meta.url), "utf8");
const stylesheetEntry = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("persistence exposes explicit restore, pending, saving, saved, and error states", () => {
  for (const state of ["restoring", "ready", "pending", "saving", "saved", "error"]) {
    assert.ok(persistence.includes(`state: "${state}"`), `missing ${state} save state`);
    assert.ok(header.includes(`${state}:`), `missing ${state} presentation label`);
  }
  assert.match(persistence, /record\.savedAt/);
  assert.match(persistence, /saveRevisionRef/);
});

test("autosave state changes when a save is queued and only the latest revision marks saved", () => {
  assert.match(persistence, /setSaveStatus\(\(current\) => \(\{ \.\.\.current, state: "pending", error: null \}\)\)/);
  assert.match(persistence, /revision === saveRevisionRef\.current && !saveTimerRef\.current/);
  assert.match(persistence, /state: "saved", lastSavedAt: savedAt/);
  assert.match(persistence, /emergencySaved/);
});

test("header wires Save now and recovery download to existing persistence callbacks", () => {
  assert.match(app, /saveStatus=\{saveStatus\}/);
  assert.match(app, /onSaveNow=\{retryLocalSave\}/);
  assert.match(app, /onDownloadRecoveryBackup=\{downloadRecoveryBackup\}/);
  assert.match(header, /onSaveNow\?\.\(\)/);
  assert.match(header, /onDownloadRecoveryBackup\?\.\(\)/);
});

test("compact save popover replaces verbose recovery banners with one helpful status tooltip", () => {
  assert.match(header, /This draft is automatically saved in this browser/);
  assert.match(header, /aria-label="Recovery backup"/);
  assert.match(header, /onDownloadRecoveryBackup\?\.\(\)/);
  assert.doesNotMatch(header, /Local save &amp; recovery/);
  assert.doesNotMatch(header, /Local autosave is not a cloud backup/);
  assert.match(tabs, /createPortal\(/);
  assert.match(tabs, /has-save-menu/);
});
test("save status styling supports dark mode, small desktop widths, and keyboard focus", () => {
  assert.match(styles, /\.app\.theme-dark \.desktop-app-save-status-popover/);
  assert.match(styles, /@media \(max-width: 1280px\) and \(min-width: 1025px\)/);
  assert.match(styles, /\.desktop-app-save-status-trigger:focus-visible/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});

test("save status stylesheet is imported with the other stylesheets before CSS rules", () => {
  assert.match(stylesheetEntry, /@import "\.\/styles\/document-save-status\.css";/);
  const firstRule = stylesheetEntry.indexOf(".kubernetes-library-status");
  assert.ok(firstRule > stylesheetEntry.indexOf('@import "./styles/document-save-status.css";'));
});


test("active-tab save header uses one status pill without repeating storage banners", () => {
  assert.match(header, /const storageLocation = isCloudDocument \? "Cloud" : currentDocumentFileBacked \? "File" : "Browser"/);
  assert.match(header, /canvas-tabs-save-status/);
  assert.match(header, /isCloudDocument \? "Cloud Workspace"/);
  assert.doesNotMatch(header, /Browser draft<\/span>/);
  assert.doesNotMatch(header, /desktop-app-document-location/);
});
test("active-tab save status reflects the relevant local, file, or cloud save state", () => {
  assert.match(header, /!isCloudDocument && !currentDocumentFileBacked/);
  assert.match(header, /currentDocumentFileBacked && currentDocumentDirty/);
  assert.match(header, /isCloudDocument && \["pending", "saving", "error", "conflict"\]\.includes\(cloudSaveState\)/);
  assert.match(header, /canvas-tabs-save-status/);
  assert.match(tabStyles, /\.canvas-tabs-save-status\.is-unsaved/);
  assert.match(tabStyles, /\.canvas-tabs-save-status\.is-saved/);
});
test("canvas menu groups compact save, cloud, and export actions", () => {
  assert.match(header, /<h3>Save &amp; sync<\/h3>/);
  assert.match(header, /<h3>Export<\/h3>/);
  assert.match(header, /aria-label="Save locally"/);
  assert.match(header, /aria-label="Save to Cloud"/);
  assert.match(header, /<strong>Save to File\.\.\.<\/strong>/);
  assert.match(header, /aria-label="Recovery backup"/);
  assert.match(header, /aria-label="Export studio"/);
  assert.match(header, /Ctrl\+Shift\+E/);
  assert.match(tabStyles, /\.canvas-tabs-active-menu-action-copy/);
  assert.match(tabStyles, /height: 34px/);
  assert.match(tabStyles, /width: 288px/);
  assert.match(tabStyles, /z-index: 9999/);
});
test("canvas tabs support double-click inline rename without a permanent pencil control", () => {
  assert.match(tabs, /activeRenameAction\?\.type === "input"/);
  assert.match(tabs, /onDoubleClick=\{\(\) => \{/);
  assert.match(tabs, /onRename\?\.\(tab\.id\)/);
  assert.match(header, /className="desktop-app-document-identity-name-input"/);
  assert.match(tabStyles, /\.canvas-tab-editing-label/);
});
