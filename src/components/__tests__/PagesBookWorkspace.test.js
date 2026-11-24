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

test("New Chapter creates an isolated Excalidraw page from the navigator and chapter index", () => {
  assert.match(pages, /className="canvas-pages-chapter-new"/);
  assert.match(pages, /onClick=\{\(\) => \{ add\(\); setChapterIndexOpen\(false\); \}\}/);
  assert.match(pages, /const createPage = \(\) =>/);
  assert.match(pages, /pageSkeleton\(elements, responsiveSize, crypto\.randomUUID\(\)/);
  assert.match(pages, /className="canvas-pages-add"/);
  assert.ok(pages.includes("<span>+ Chapter</span>"));
});

test("book workspace receives the chapter collection and completion callback", () => {
  assert.match(workspace, /pages = \[\]/);
  assert.match(workspace, /onToggleRead/);
  assert.match(workspace, /pages\.length/);
  assert.match(workspace, /onToggleRead\(active\)/);
  assert.match(pages, /<PagesBookWorkspace pages=\{pages\}/);
  assert.match(pages, /onToggleRead=\{toggleChapterRead\}/);
});

test("chapter title and one-line summary are editable and persisted on the page record", () => {
  assert.match(workspace, /aria-label="Chapter title"/);
  assert.match(workspace, /onPatch\(\{ chapterTitle: e\.target\.value \}\)/);
  assert.match(workspace, /aria-label="Chapter subtitle"/);
  assert.match(workspace, /placeholder="Add a chapter summary or focus\.\.\."/);
  assert.match(workspace, /onPatch\(\{ tagline: e\.target\.value \}\)/);
  assert.doesNotMatch(workspace, /keyNote|RULE OF THUMB|Key formula or rule of thumb/);
  assert.match(pages, /customData: \{ \.\.\.element\.customData, \.\.\.patch \}/);
  assert.match(pages, /activeChapterId: page\.id/);
  assert.match(pages, /p\.id === persistedActiveId/);
  assert.match(tabs, /frame\.customData\?\.chapterAppState \|\| \{/);
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

test("the bottom-right navigator is the sole chapter index with completion, delete, and add actions", () => {
  assert.doesNotMatch(workspace, /pages-chapters-rail|pages-rail-heading/);
  assert.match(pages, /className="canvas-pages-chapter-trigger"/);
  assert.match(pages, /aria-expanded=\{chapterIndexOpen\}/);
  assert.match(pages, /className="canvas-pages-chapter-popover"/);
  assert.match(pages, /onMouseDown=\{event => event\.stopPropagation\(\)\}/);
  assert.match(pages, /onClick=\{\(\) => toggleChapterRead\(page\)\}/);
  assert.match(pages, /onClick=\{\(\) => deletePage\(page\)\}/);
  assert.match(pages, /＋ New Chapter/);
  assert.match(pages, /aria-label="Previous chapter"/);
  assert.match(pages, /aria-label="Next chapter"/);
  assert.match(pages, /fit\(pages\[index-1\]\)/);
  assert.match(pages, /fit\(pages\[index\+1\]\)/);
  assert.match(styles, /bottom: calc\(100% \+ 10px\)/);
  assert.match(styles, /z-index: 1000/);
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
  assert.match(styles, /z-index: 10027 !important/);
  assert.doesNotMatch(styles, /167 157 224/);
  assert.match(styles, /\.pages-editorial-header input, \.pages-editorial-header button \{ pointer-events: auto; \}/);
  assert.doesNotMatch(styles, /#(?:7061a8|9e88ed|a68af0|a79de0|978fcf|7968ee)/i);
});


test("chapter workspace is full-bleed and removes the boxed sheet width controls", () => {
  assert.doesNotMatch(workspace, /pages-width-switcher|Standard|Wide/);
  assert.doesNotMatch(workspace, /pageRect|pages-book-edge|pages-book-spine/);
  assert.match(pages, /function getFullBleedPageSize\(\)/);
  assert.match(pages, /width: Math\.max\(320, Math\.round\(window\.innerWidth\)\)/);
  assert.match(pages, /height: Math\.max\(320, Math\.round\(window\.innerHeight\)\)/);
  assert.match(pages, /const resizeChapter = \(\) =>/);
  assert.match(pages, /<PagesBookWorkspace pages=\{pages\} active=\{active\} index=\{index\}/);
  assert.doesNotMatch(pages, /setPageWidthMode|canvas-pages-resize-hit/);
  assert.match(styles, /\.pages-book-sheet \{[\s\S]*?inset: 0 !important;[\s\S]*?width: 100vw !important;[\s\S]*?height: 100vh !important/);
  assert.match(styles, /max-width: 1160px !important/);
  assert.match(styles, /margin: 64px auto 0 !important/);
  assert.match(styles, /padding: 0 32px 16px !important/);
  assert.match(styles, /border-bottom: 1px solid var\(--book-border\)/);
  assert.match(styles, /bottom: 58px !important/);
  assert.match(workspace, /pages-paper-switcher/);
  assert.match(workspace, /pages-mark-read/);
  assert.match(styles, /\.pages-editorial-title-row/);
  assert.match(styles, /\.pages-mark-read\[aria-pressed="true"\]/);
  assert.doesNotMatch(workspace, /pages-book-folio/);
  assert.doesNotMatch(styles, /pages-book-folio/);
});

test("Pages paper and textures stay behind fully opaque native canvas rendering", () => {
  assert.match(pages, /function getPagePaperBackground\(appState, isPagesMode = false\)\s*\{[\s\S]*?if \(isPagesMode\)[\s\S]*?return 'transparent'/);
  assert.match(pages, /viewBackgroundColor: 'transparent'/);
  assert.match(pages, /requestExcalidrawCanvasRefresh/);
  assert.match(pages, /window\.dispatchEvent\(new Event\('resize'\)\)/);
  assert.match(pages, /moveChapter\(targetPage, 0, 0\)/);
  assert.match(pages, /scrollX: 0, scrollY: 0, zoom: \{ value: 1 \}/);
  assert.match(styles, /\.pages-book-workspace \{ z-index: auto; \}/);
  assert.match(styles, /\.pages-book-sheet \{ z-index: 0; \}/);
  assert.match(styles, /\.pages-book-canvas-zone \{ z-index: 0; \}/);
  assert.match(styles, /\.desktop-canvas-region canvas \{[\s\S]*?z-index: 1 !important/);
  assert.match(styles, /\.excalidraw-textEditorContainer \{[\s\S]*?z-index: 10030 !important/);
  assert.match(styles, /\.excalidraw-textEditorContainer textarea \{[\s\S]*?background: transparent !important/);
  assert.doesNotMatch(styles, /transform:\s*scale\(/);
});
