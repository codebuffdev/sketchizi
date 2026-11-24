import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = readFileSync(resolve(here, "../../features/pages/PagesBookWorkspace.jsx"), "utf8");
const pages = readFileSync(resolve(here, "../../features/pages/CanvasPages.jsx"), "utf8");
const persistence = readFileSync(resolve(here, "../../persistence.js"), "utf8");
const tabs = readFileSync(resolve(here, "../../hooks/useWorkspaceTabs.js"), "utf8");
const styles = readFileSync(resolve(here, "../../features/pages/pages.css"), "utf8");

test("New Chapter creates a new isolated Excalidraw page and exposes both chapter creation controls", () => {
  assert.match(workspace, /className="pages-new-chapter"/);
  assert.match(workspace, /onClick={onAdd}/);
  assert.match(pages, /const createPage = \(\) =>/);
  assert.match(pages, /pageSkeleton\(elements, responsiveSize, crypto\.randomUUID\(\)/);
  assert.match(pages, /className="canvas-pages-add"/);
});

test("chapter title, subtitle, and key formula are editable and persisted on the page record", () => {
  assert.match(workspace, /aria-label="Chapter title"/);
  assert.match(workspace, /onPatch\(\{ chapterTitle: e\.target\.value \}\)/);
  assert.match(workspace, /aria-label="Chapter subtitle"/);
  assert.match(workspace, /onPatch\(\{ tagline: e\.target\.value \}\)/);
  assert.match(workspace, /aria-label="Key formula or rule of thumb"/);
  assert.match(workspace, /onPatch\(\{ keyNote: e\.target\.value \}\)/);
  assert.match(pages, /customData: \{ \.\.\.element\.customData, \.\.\.patch \}/);
  assert.match(pages, /customData\.activeChapterId = page\.id/);
  assert.match(pages, /p\.id === persistedActiveId/);
  assert.match(pages, /chapterAppState =/);
  assert.match(tabs, /const chapters = chapterFrames\.map/);
  assert.match(tabs, /activeChapterId,/);
  assert.match(tabs, /appState: sanitizeTabAppState\(frame\.customData\?\.chapterAppState/);
  assert.match(tabs, /elements: sceneElements/);
});

test("Dots, Ruled, and Clean paper textures are selectable per chapter", () => {
  assert.match(workspace, /\['Dots', 'Ruled', 'Clean'\]/);
  assert.match(workspace, /onPatch\(\{ paperTexture: value \}\)/);
  assert.match(styles, /\.pages-book-canvas-zone\.texture-dots/);
  assert.match(styles, /\.pages-book-canvas-zone\.texture-ruled/);
});

test("previous/next navigation and the Chapters rail select the matching chapter", () => {
  assert.match(workspace, /aria-label="Chapters"/);
  assert.match(workspace, /onClick=\{\(\) => onSelect\(page\)\}/);
  assert.match(pages, /aria-label="Previous chapter"/);
  assert.match(pages, /aria-label="Next chapter"/);
  assert.match(pages, /fit\(pages\[index-1\]\)/);
  assert.match(pages, /fit\(pages\[index\+1\]\)/);
});

test("chapter metadata and diagram elements persist together in the existing IndexedDB tab snapshot", () => {
  assert.match(pages, /customData: \{ \.\.\.element\.customData, \.\.\.patch \}/);
  assert.match(tabs, /const sceneElements = Array\.isArray\(elements\) \? elements : \(api\?\.getSceneElementsIncludingDeleted/);
  assert.match(tabs, /const sceneAppState = appState \|\| api\?\.getAppState/);
  assert.match(persistence, /indexedDB\.open\(DB_NAME, DB_VERSION\)/);
  assert.match(persistence, /canvas-tabs-manifest/);
  assert.match(workspace, /paperTexture/);
  assert.match(workspace, /keyNote/);
});

test("Pages book styling uses the muted slate and emerald palette without purple accents", () => {
  assert.match(styles, /#eef2f6/);
  assert.match(styles, /#0b0f17/);
  assert.match(styles, /#059669/);
  assert.match(styles, /#34d399/);
  assert.doesNotMatch(styles, /#(?:7061a8|9e88ed|a68af0|a79de0|978fcf)/i);
});
