import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getRecentFolderActivityLabel,
  getRecentFolderAvailability,
  getRecentFolderTypeLabel,
} from "../src/features/files/recentFolderPresentation.js";

const menu = readFileSync(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
const menuTemplate = menu.slice(menu.indexOf("recentSection.innerHTML = `"), menu.indexOf("customBlock.append(recentSection)"));
const hook = readFileSync(new URL("../src/features/files/useRecentFiles.js", import.meta.url), "utf8");
const manager = readFileSync(new URL("../src/features/files/useFileManager.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/responsive-features.css", import.meta.url), "utf8");
const theme = readFileSync(new URL("../src/styles/responsive-theme.css", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("recent folder presentation shows type and relative last-opened time", () => {
  const now = 1_800_000_000_000;
  assert.equal(getRecentFolderTypeLabel({ kind: "directory" }), "FOLDER");
  assert.equal(getRecentFolderTypeLabel({ fallback: true }), "READ-ONLY");
  assert.equal(getRecentFolderActivityLabel({ openedAt: now - 5 * 60_000 }, now), "Opened 5 min ago");
  assert.equal(getRecentFolderActivityLabel({}, now), "Recently used");
});

test("recent folder unavailable and permission states explain next steps", () => {
  assert.equal(getRecentFolderAvailability({ availability: "missing" }).label, "Unavailable");
  assert.match(getRecentFolderAvailability({ availability: "missing" }).message, /reopen the folder to reconnect/i);
  assert.equal(getRecentFolderAvailability({ availability: "permission" }).label, "Permission needed");
  assert.match(getRecentFolderAvailability({ availability: "permission" }).message, /request permission again/i);
  assert.equal(getRecentFolderAvailability({ availability: "available" }), null);
  assert.equal(getRecentFolderAvailability({ fallback: true }).label, "Read-only");
});

test("recent folder state persists access failures and successful checks", () => {
  assert.match(hook, /const updateRecentFolderStatus = \(id, status\)/);
  assert.match(hook, /persistRecentFolders\(next\)/);
  assert.match(hook, /const markRecentFolderOpened = \(id\)/);
  assert.match(hook, /lastCheckedAt: Date\.now\(\)/);
  assert.match(manager, /updateRecentFolderStatus\(id, "missing"\)/);
  assert.match(manager, /updateRecentFolderStatus\(id, "permission"\)/);
  assert.match(manager, /markRecentFolderOpened\(id\)/);
  assert.match(manager, /recentState\.updateRecentFolderStatus\?\.\(folder\.id, "available"\)/);
  assert.match(manager, /Do not leave a stale file listing visible/);
});

test("folder browser refresh UI is removed from the hamburger menu", () => {
  assert.doesNotMatch(menuTemplate, /aria-label="Current folder"/);
  assert.doesNotMatch(menuTemplate, /data-current-folder-files/);
  assert.doesNotMatch(menuTemplate, /data-folder-refresh-status role="status"/);
  assert.doesNotMatch(menuTemplate, /Refreshing folder…/);
});

test("recent folder rows expose accessible activity, type, and status metadata", () => {
  assert.match(menu, /getRecentFolderTypeLabel\(item\)/);
  assert.match(menu, /getRecentFolderActivityLabel\(item\)/);
  assert.match(menu, /getRecentFolderAvailability\(item\)/);
  assert.match(menu, /data-recent-folder-availability/);
  assert.match(menu, /aria-label="\$\{escapeHtml\(`/);
  assert.match(styles, /\.sketchizi-recent-folder-meta/);
  assert.match(styles, /\.sketchizi-folder-refresh-status\[data-state="success"\]/);
  assert.match(theme, /data-recent-folder-availability="permission"/);
});

test("recent-folder tests are included in the UI modernization suite", () => {
  assert.match(packageJson.scripts["test:ui-modernization"], /tests\/ui-modernization-recent-folders\.test\.js/);
});
