import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const header = readFileSync(new URL("../src/components/app/DesktopAppHeader.jsx", import.meta.url), "utf8");
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

test("recovery details explain browser-local storage and expose current-canvas backup", () => {
  assert.match(header, /Local save &amp; recovery/);
  assert.match(header, /autosaves this canvas in this browser on this device/);
  assert.match(header, /Download recovery backup/);
  assert.match(header, /Local autosave is not a cloud backup/);
  assert.match(header, /role="dialog"/);
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


test("download option stays neutral when local autosave succeeds", () => {
  assert.match(header, /className="desktop-app-save-status-trigger"/);
  assert.doesNotMatch(styles, /\.desktop-app-save-status-trigger\.is-saved\s*\{/);
  assert.match(styles, /\.desktop-app-document-identity-dirty-dot\.is-saved\s*\{/);
});

test("document identity dot follows local autosave state, not file dirty state", () => {
  assert.match(header, /!isCloudDocument && !currentDocumentFileBacked && \["pending", "saving", "saved", "error"\]\.includes\(saveState\)/);
  assert.match(header, /desktop-app-document-identity-dirty-dot is-\$\{saveState\}/);
  assert.match(header, /Saved locally on this device/);
  assert.match(styles, /\.desktop-app-document-identity-dirty-dot\.is-saved\s*\{/);
  assert.match(styles, /\.desktop-app-document-identity-dirty-dot\.is-pending/);
  assert.match(styles, /\.desktop-app-document-identity-dirty-dot\.is-error/);
  assert.match(styles, /background: #22a06b/);
});
