import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getRecentFileActivityLabel,
  getRecentFileAvailability,
  getRecentFileOriginLabel,
  getRecentFileTypeLabel,
} from "../src/features/files/recentFilePresentation.js";

const menu = readFileSync(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");
const recentHook = readFileSync(new URL("../src/features/files/useRecentFiles.js", import.meta.url), "utf8");
const fileManager = readFileSync(new URL("../src/features/files/useFileManager.js", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles/responsive-features.css", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("recent file type labels distinguish Sketchizi, Excalidraw, JSON and local drawings", () => {
  assert.equal(getRecentFileTypeLabel({ name: "architecture.sketchizi", kind: "file" }), "SKETCHIZI");
  assert.equal(getRecentFileTypeLabel({ name: "flow.EXCALIDRAW", kind: "file" }), "EXCALIDRAW");
  assert.equal(getRecentFileTypeLabel({ name: "diagram.json", kind: "file" }), "JSON");
  assert.equal(getRecentFileTypeLabel({ name: "Untitled", kind: "snapshot" }), "LOCAL DRAWING");
});

test("recent file origin and activity labels explain storage location and last-opened time", () => {
  const now = 1_800_000_000_000;
  assert.equal(getRecentFileOriginLabel({ kind: "file" }), "Linked file");
  assert.equal(getRecentFileOriginLabel({ kind: "snapshot" }), "Browser-local copy");
  assert.equal(getRecentFileActivityLabel({ lastOpenedAt: now - 5 * 60_000 }, now), "Opened 5 min ago");
  assert.equal(getRecentFileActivityLabel({ savedAt: now - 2 * 60_000 }, now), "Added 2 min ago");
  assert.equal(getRecentFileActivityLabel({}, now), "Recently added");
});

test("unavailable and permission-denied entries provide actionable status", () => {
  assert.match(getRecentFileAvailability({ availability: "missing" }).message, /Select to retry/);
  assert.equal(getRecentFileAvailability({ availability: "missing" }).label, "Unavailable");
  assert.match(getRecentFileAvailability({ availability: "permission" }).message, /request file access again/);
  assert.equal(getRecentFileAvailability({ availability: "permission" }).label, "Permission needed");
  assert.equal(getRecentFileAvailability({ availability: "available" }), null);
});

test("recent-file list renders format, origin, last-opened, and availability details accessibly", () => {
  assert.match(menu, /getRecentFileTypeLabel\(item\)/);
  assert.match(menu, /getRecentFileActivityLabel\(item\)/);
  assert.match(menu, /getRecentFileAvailability\(item\)/);
  assert.match(menu, /data-recent-availability/);
  assert.match(menu, /aria-label="\$\{escapeHtml\(`/);
  assert.match(styles, /\.sketchizi-recent-meta/);
  assert.match(styles, /data-recent-availability="missing"/);
});

test("recent status updates persist, successful opens clear stale status, and last-opened survives saves", () => {
  assert.match(recentHook, /const updateRecentFileStatus = \(id, status\)/);
  assert.match(recentHook, /localStorage\.setItem\("sketchizi-recent-files", JSON\.stringify\(next\)\)/);
  assert.match(recentHook, /lastOpenedAt: record\.lastOpenedAt \?\? previous\?\.lastOpenedAt/);
  assert.match(recentHook, /record\.availability === "available" \? undefined/);
  assert.match(fileManager, /updateRecentFileStatus\(id, "missing"\)/);
  assert.match(fileManager, /updateRecentFileStatus\(id, "permission"\)/);
  assert.match(fileManager, /lastOpenedAt: Date\.now\(\), availability: "available"/);
  assert.match(fileManager, /rememberRecentFile\(\{ \.\.\.record, lastOpenedAt: Date\.now\(\), availability: "available", kind: "snapshot" \}\)/);
  assert.doesNotMatch(fileManager.slice(fileManager.indexOf("const openRecentFile"), fileManager.indexOf("useEffect(() => {\n    let cancelled = false;\n    loadAllFileHandles")), /forgetRecentFile\(id\)/);
});

test("recent-file regression tests are included in the UI modernization suite", () => {
  assert.match(packageJson.scripts["test:ui-modernization"], /tests\/ui-modernization-recent-files\.test\.js/);
});
