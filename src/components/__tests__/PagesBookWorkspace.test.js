import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const workspace = readFileSync(resolve(here, "../../features/pages/PagesBookWorkspace.jsx"), "utf8");
const pages = readFileSync(resolve(here, "../../features/pages/CanvasPages.jsx"), "utf8");
const canvas = readFileSync(resolve(here, "../app/SketchiziCanvas.jsx"), "utf8");
const app = readFileSync(resolve(here, "../../App.jsx"), "utf8");
const persistence = readFileSync(resolve(here, "../../persistence.js"), "utf8");
const tabs = readFileSync(resolve(here, "../../hooks/useWorkspaceTabs.js"), "utf8");
const styles = readFileSync(resolve(here, "../../features/pages/pages.css"), "utf8");

test("New Chapter creates an isolated Excalidraw page from the header controller and chapter index", () => {
  assert.match(workspace, /className="canvas-pages-chapter-new"/);
  assert.match(workspace, /onClick=\{onAddChapter\}/);
  assert.match(pages, /onAddChapter=\{\(\) => \{ add\(\); setChapterIndexOpen\(false\); \}\}/);
  assert.match(pages, /const createPage = \(\) =>/);
  assert.match(pages, /pageSkeleton\(elements, responsiveSize, crypto\.randomUUID\(\)/);
  assert.match(workspace, /className="canvas-pages-add"/);
  assert.ok(workspace.includes("<span>+ Chapter</span>"));
});

test("book workspace receives the chapter collection and completion callback", () => {
  assert.match(workspace, /pages = \[\]/);
  assert.match(workspace, /onToggleRead/);
  assert.match(workspace, /onToggleRead\(active\)/);
  assert.match(pages, /<PagesBookWorkspace pages=\{pages\}/);
  assert.match(pages, /onToggleRead=\{toggleChapterRead\}/);
});

test("chapter title and one-line summary are editable and persisted on the page record", () => {
  assert.match(workspace, /aria-label="Chapter title"/);
  assert.match(workspace, /onPatch\(\{ chapterTitle: e\.target\.value \}\)/);
  assert.match(workspace, /aria-label="Chapter subtitle"/);
  assert.match(workspace, /placeholder="Add a page summary or focus\.\.\."/);
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

test("the chapter index, completion, delete, and add actions live in the editorial header", () => {
  assert.doesNotMatch(workspace, /pages-chapters-rail|pages-rail-heading/);
  assert.match(workspace, /className="canvas-pages-chapter-trigger"/);
  assert.match(workspace, /aria-expanded=\{chapterIndexOpen\}/);
  assert.match(workspace, /className="canvas-pages-chapter-popover"/);
  assert.match(workspace, /onMouseDown=\{event => event\.stopPropagation\(\)\}/);
  assert.match(workspace, /onClick=\{\(\) => onToggleRead\(page\)\}/);
  assert.match(workspace, /onClick=\{\(\) => requestDeleteChapter\(page\)\}/);
  assert.match(workspace, /＋ New Chapter/);
  assert.match(workspace, /aria-label="Previous chapter"/);
  assert.match(workspace, /aria-label="Next chapter"/);
  assert.match(pages, /onSelectChapter=\{page => \{ if \(page\) fit\(page\); setChapterIndexOpen\(false\); \}\}/);
  assert.match(styles, /top: calc\(100% \+ 8px\)/);
  assert.match(styles, /right: 0 !important/);
  assert.match(styles, /z-index: 1000/);
});

test("chapter metadata and diagram elements persist together in the existing IndexedDB tab snapshot", () => {
  assert.match(pages, /customData: \{ \.\.\.element\.customData, \.\.\.patch \}/);
  assert.match(tabs, /const sceneElements = Array\.isArray\(elements\) \? elements : \(api\?\.getSceneElementsIncludingDeleted/);
  assert.match(tabs, /const sceneAppState = appState \|\| api\?\.getAppState/);
  assert.match(persistence, /indexedDB\.open\(DB_NAME, DB_VERSION\)/);
  assert.match(persistence, /canvas-tabs-manifest/);
  assert.match(workspace, /paperTexture/);
  assert.match(workspace, /paperTexture/);
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


test("Pages paper textures show through transparent Excalidraw in light and dark themes", () => {
  assert.match(canvas, /viewBackgroundColor: savedSketch\?\.appState\?\.viewBackgroundColor \|\| getCanvasAppearanceBackground\(activeAppearance, isDarkTheme\)/);
  assert.match(canvas, /\.\.\.\(pageContext\?\.mode === "pages" \? \{ viewBackgroundColor: "transparent" \} : \{\}\)/);
  assert.match(canvas, /pages-canvas-wrapper/);
  assert.match(canvas, /viewBackgroundColor: "transparent"/);
  assert.match(pages, /setCanvasTheme\(current => current === nextTheme \? current : nextTheme\)/);
  assert.match(pages, /\[api, mode, active\?\.id, canvasTheme\]/);
  assert.match(styles, /\.pages-canvas-wrapper \.excalidraw,[\s\S]*?--default-bg-color: transparent !important/);
  assert.match(styles, /radial-gradient\(circle, var\(--book-dot\) 1\.25px, transparent 1\.25px\)/);
  assert.match(styles, /background-size: 22px 22px/);
  assert.match(styles, /var\(--book-rule\) 27px,[\s\S]*?var\(--book-rule\) 28px/);
  assert.match(styles, /--book-paper: #ffffff/);
  assert.match(styles, /--book-paper: #0f141d/);
  assert.match(styles, /--book-dot: #2b3648/);
  assert.match(styles, /--book-rule: #1e293b/);
});

test("chapter eyebrow and chapter controller share the editorial masthead without bottom floating controls", () => {
  assert.match(workspace, /<span>\{String\(index \+ 1\)\.padStart\(2, '0'\)\}<\/span>/);
  assert.match(workspace, /pages-eyebrow-separator/);
  assert.doesNotMatch(workspace, /CHAPTER/);
  assert.match(workspace, /onPointerDown=\{e => e\.stopPropagation\(\)\}/);
  assert.match(workspace, /onMouseDown=\{e => e\.stopPropagation\(\)\}/);
  assert.match(pages, /frame\.name = 'Untitled Page'/);
  assert.match(workspace, /aria-label="Book \/ notebook title"/);
  assert.match(workspace, /await onRenameBookTitle\(nextTitle\)/);
  assert.match(workspace, /onKeyDown=\{e => \{ e\.stopPropagation\(\)/);
  assert.match(workspace, /Untitled Page/);
  assert.match(workspace, /Add a page summary or focus/);
  assert.match(styles, /\.pages-book-title-input/);
  assert.match(pages, /bookTitle=\{bookTitle\} onRenameBookTitle=\{onRenameBookTitle\}/);
  assert.match(styles, /font-variant-numeric: tabular-nums/);
  assert.match(workspace, /pages-header-chapter-controller/);
  assert.match(pages, /chapterIndexOpen=\{chapterIndexOpen\}/);
  assert.match(pages, /onAddChapter=\{\(\) => \{ add\(\); setChapterIndexOpen\(false\); \}\}/);
  assert.doesNotMatch(pages, /pages-bottom-actions/);
  assert.doesNotMatch(app, /pages-bottom-actions/);
  assert.doesNotMatch(styles, /pages-bottom-actions/);
  assert.match(app, /canvasPageContext\.mode !== "pages"/);
  assert.match(workspace, /title=\{value\} aria-label=\{value\} aria-pressed=\{texture === value\}/);
  assert.match(workspace, /<svg viewBox="0 0 16 16"/);
  assert.doesNotMatch(workspace, />\{value\}<\/button>/);
  assert.match(styles, /max-width: 1180px !important/);
  assert.match(styles, /margin: 62px auto 0 !important/);
  assert.match(styles, /padding: 0 36px 18px !important/);
  assert.match(styles, /border-bottom: 1px solid #e2e8f0 !important/);
  assert.match(styles, /pages-editorial-copy::before/);
  assert.match(styles, /width: 3px/);
  assert.match(styles, /font-size: 26px !important/);
  assert.match(styles, /font-size: 14px !important/);
  assert.match(styles, /height: 28px !important/);
  assert.match(styles, /clip-path: inset\(156px 0 0 0\)/);
  assert.match(styles, /clip-path: inset\(200px 0 0 0\)/);

});

test("deleting the only Pages chapter requires accessible confirmation and closes the notebook tab", () => {
  assert.match(workspace, /pages\.length === 1/);
  assert.match(workspace, /setDeleteOnlyPageOpen\(true\)/);
  assert.match(workspace, /role="dialog" aria-modal="true"/);
  assert.match(workspace, /Delete &quot;\{bookTitle \|\| 'Untitled drawing'\}\&quot;\?/);
  assert.match(workspace, /This is the only page remaining\. Deleting it will permanently remove this notebook and close its tab\./);
  assert.match(workspace, />Cancel<\/button>/);
  assert.match(workspace, /Delete & Close/);
  assert.match(workspace, /event\.key === 'Escape'/);
  assert.match(workspace, /event\.key !== 'Escape' && event\.key !== 'Enter'/);
  assert.match(pages, /onDeleteOnlyPage=\{onDeleteOnlyPage\}/);
  assert.match(app, /await deleteDocument\(activeTab\.id\)/);
  assert.match(app, /performCloseCanvasTab\(activeTab\.id, \{ keepDraft: false \}\)/);
  assert.match(app, /createCanvasTab\(\{ name: "Canvas 1" \}\)/);
  assert.match(app, /mode: "infinite"/);
  assert.match(app, /nextTabHasPages/);
  assert.match(tabs, /\(\{ name: requestedName \} = \{\}\)/);
  assert.match(persistence, /export async function deleteDocument\(id\)/);
  assert.match(styles, /pages-delete-confirm-submit/);
  assert.match(styles, /#e11d48/);
  assert.match(styles, /\.app\.theme-dark \.pages-delete-confirm-dialog/);
});
