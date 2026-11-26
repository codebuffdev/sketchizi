import test from 'node:test';
import assert from 'node:assert/strict';
import { getPages, validSize, pageSkeleton, DEFAULT_PAGE_SIZE, getPageViewportMask, getPageFitViewport } from '../src/features/pages/pageModel.js';
test('adding a page preserves existing artwork and places the sheet beyond its bounds', () => {
 const existing = [{id:'drawing',type:'rectangle',x:100,y:40,width:500,height:20}];
 const snapshot = structuredClone(existing);
 const [paper,page] = pageSkeleton(existing,DEFAULT_PAGE_SIZE,'new-page');
 assert.deepEqual(existing,snapshot);
 assert(paper.x > 600);
 assert(paper.x - (100 + 500) >= 10000, 'separate sheets far enough that fitting one page cannot reveal its neighbor');
 assert.deepEqual({ width: page.width, height: page.height }, DEFAULT_PAGE_SIZE);
 assert.deepEqual({ width: paper.width, height: paper.height }, DEFAULT_PAGE_SIZE);
 assert.equal(paper.backgroundColor,'transparent'); assert.equal(paper.strokeColor,'transparent');
 assert.deepEqual(page.children,[paper.id]); assert.equal(paper.locked,true);
});
test('page discovery survives serialization, ignores deleted pages and ordinary frames', () => {
 const pages = [{id:'b',type:'frame',customData:{sketchiziPage:true,pageOrder:2}}, {id:'a',type:'frame',customData:{sketchiziPage:true,pageOrder:1}}, {id:'c',type:'frame'}, {id:'d',type:'frame',isDeleted:true,customData:{sketchiziPage:true}}];
 assert.deepEqual(getPages(JSON.parse(JSON.stringify(pages))).map(p=>p.id),['a','b']);
});
test('invalid page sizes cannot create broken or unbounded sheets', () => {
 for(const bad of [NaN,Infinity,0,-1,10001]) { assert.equal(validSize(bad,1400),false); assert.throws(()=>pageSkeleton([],{width:bad,height:1400},'p')); }
 assert.equal(validSize(320,10000),true);
});
test('duplicating a page remaps internal bindings and preserves the source and image file IDs', async () => {
 const { duplicatePage } = await import('../src/features/pages/pageModel.js');
 const source = [
  {id:'shape',type:'rectangle',x:20,y:20,width:50,height:50,frameId:'p',boundElements:[{id:'arrow',type:'arrow'}],groupIds:['g']},
  {id:'arrow',type:'arrow',x:30,y:30,width:50,height:20,frameId:'p',startBinding:{elementId:'shape'},endBinding:{elementId:'outside'}},
  {id:'image',type:'image',x:0,y:0,width:20,height:20,frameId:'p',fileId:'file-1'},
  {id:'p',type:'frame',x:0,y:0,width:1600,height:1400,name:'Notes',customData:{sketchiziPage:true,pageOrder:1}},
 ];
 const snapshot = structuredClone(source), copy = duplicatePage(source,'p','copy');
 assert.deepEqual(source,snapshot); assert.equal(copy.length,4);
 assert.equal(copy[0].frameId,'copy'); assert.equal(copy[1].startBinding.elementId,copy[0].id);
 assert.equal(copy[1].endBinding,null); assert.equal(copy[2].fileId,'file-1');
 assert.equal(copy[3].customData.pageOrder,2); assert(copy[3].x > 1600);
});

test('page viewport mask leaves only the selected page visible and blocks the surrounding canvas', () => {
 const mask = getPageViewportMask(
  {x:500,y:200,width:1000,height:800},
  {offsetLeft:100,offsetTop:50,width:1200,height:900,scrollX:0,scrollY:0,zoom:{value:0.5},theme:'dark',viewBackgroundColor:'#f4f5f7'}
 );
 assert.equal(mask.backgroundColor,'#111820');
 assert.deepEqual(mask.pageRect,{left:350,top:150,width:500,height:400});
 assert.deepEqual(mask.panels,[
  {left:100,top:50,width:1200,height:100},
  {left:100,top:550,width:1200,height:400},
  {left:100,top:150,width:250,height:400},
  {left:850,top:150,width:450,height:400},
 ]);
});
test('page viewport mask follows the light theme', () => {
 const mask = getPageViewportMask(
  {x:0,y:0,width:800,height:600},
  {offsetLeft:0,offsetTop:0,width:1000,height:800,scrollX:0,scrollY:0,zoom:{value:1},theme:'light'}
 );
 assert.equal(mask.backgroundColor,'#f7f9fc');
});
test('page viewport mask clips pages to the visible canvas and rejects an off-screen page', () => {
 const clipped = getPageViewportMask(
  {x:-200,y:100,width:500,height:300},
  {offsetLeft:100,offsetTop:50,width:800,height:600,scrollX:0,scrollY:0,zoom:{value:1}}
 );
 assert.deepEqual(clipped.panels,[
  {left:100,top:50,width:800,height:100},
  {left:100,top:450,width:800,height:200},
  {left:400,top:150,width:500,height:300},
 ]);
 assert.equal(getPageViewportMask(
  {x:5000,y:5000,width:1000,height:800},
  {offsetLeft:100,offsetTop:50,width:800,height:600,scrollX:0,scrollY:0,zoom:{value:1}}
 ),null);
});

test('page fit applies the requested zoom and keeps the page centred in the viewport', () => {
  const page = { x: 300, y: 100, width: 1600, height: 1400 };
  const viewport = { width: 1200, height: 900, zoom: { value: 0.5 }, scrollX: 0, scrollY: 0 };
  for (const zoom of [0.41, 0.82, 1, 1.5]) {
    const fitted = getPageFitViewport(page, viewport, zoom);
    assert.equal(fitted.zoom.value, zoom);
    assert(Math.abs((page.x + fitted.scrollX + page.width / 2) * zoom - 600) < 1e-9);
    assert(Math.abs((page.y + fitted.scrollY + page.height / 2) * zoom - 450) < 1e-9);
  }
  for (const badZoom of [0, -1, NaN, Infinity]) assert.equal(getPageFitViewport(page, viewport, badZoom), null);
  assert.equal(getPageFitViewport(null, viewport, 1), null);
  assert.equal(getPageFitViewport(page, { ...viewport, width: 0 }, 1), null);
});

test('page edit bounds reject geometry extending beyond the active sheet, including rotation', async () => {
 const { isElementWithinPage } = await import('../src/features/pages/pageModel.js');
 const page = {x:100,y:100,width:500,height:400};
 assert.equal(isElementWithinPage({x:120,y:120,width:100,height:80},page),true);
 assert.equal(isElementWithinPage({x:550,y:120,width:100,height:80},page),false);
 assert.equal(isElementWithinPage({x:120,y:80,width:100,height:80},page),false);
 assert.equal(isElementWithinPage({x:100,y:100,width:500,height:400},page),true);
 assert.equal(isElementWithinPage({x:100,y:100,width:500,height:400,angle:Math.PI/4},page),false);
});


test('Pages component does not register stale popover handlers or dereference a missing page name draft', async () => {
 const { readFile } = await import('node:fs/promises');
 const source = await readFile(new URL('../src/features/pages/CanvasPages.jsx', import.meta.url), 'utf8');
 assert.doesNotMatch(source, /\bsetOpen\s*\(/);
 assert.doesNotMatch(source, /\broot\.current/);
 assert.match(source, /inlineName && inlineName\.pageId === active\?\.id/);
});


test('Pages keeps the paper texture behind the transparent HiDPI Excalidraw canvas', async () => {
 const { readFile } = await import('node:fs/promises');
 const pages = await readFile(new URL('../src/features/pages/CanvasPages.jsx', import.meta.url), 'utf8');
 const styles = await readFile(new URL('../src/features/pages/pages.css', import.meta.url), 'utf8');
 assert.match(pages, /function getPagePaperBackground\(appState, isPagesMode = false\)\s*\{[\s\S]*?if \(isPagesMode\)[\s\S]*?return 'transparent'/);
 assert.match(pages, /viewBackgroundColor: 'transparent'/);
 assert.match(pages, /pagesPreviousViewBackgroundColor/);
 assert.match(pages, /const restoreBackground = currentTheme/);
 assert.match(pages, /window\.dispatchEvent\(new Event\('resize'\)\)/);
 assert.match(pages, /function getFullBleedPageSize\(\)/);
 assert.match(pages, /window\.innerWidth/);
 assert.match(pages, /window\.innerHeight/);
 assert.match(pages, /const resizeChapter = \(\) =>/);
 assert.match(pages, /const fitViewportToPage = page =>/);
 assert.match(pages, /moveChapter\(targetPage, 0, 0\)/);
 assert.match(styles, /\.pages-book-workspace \{ z-index: auto; \}/);
 assert.match(styles, /\.pages-book-ui \{[\s\S]*?z-index: 10 !important/);
 assert.match(styles, /\.app\.canvas-first-header:has\(\.pages-book-workspace\) \.desktop-app-header \{ z-index: 10060 !important; \}/);
 assert.match(styles, /\.app:has\(\.pages-book-workspace\) \.desktop-app-menu-trigger-floating \{ z-index: 10070 !important; \}/);
 assert.match(styles, /body:has\(\.pages-book-workspace\) \.sketchizi-appearance \{?\s*[\s\S]*?z-index: 10080 !important/);
 assert.match(styles, /:has\(\.appearance-trigger\[aria-expanded="true"\]\) \.pages-book-ui \{\s*z-index: 10;/);
 assert.match(styles, /\.pages-book-sheet \{ z-index: 0; \}/);
 assert.match(styles, /\.pages-book-workspace \{\s*position: static;/);
 assert.match(styles, /\.pages-book-canvas-zone \{ z-index: 0; \}/);
 assert.match(styles, /width: 100vw !important/);
 assert.match(styles, /height: 100vh !important/);
 assert.match(styles, /max-width: 1180px !important/);
 assert.match(styles, /margin: 68px auto 0 !important/);
 assert.match(styles, /\.desktop-canvas-region canvas \{[\s\S]*?z-index: 1 !important/);
 assert.match(styles, /\.desktop-canvas-region canvas,\s*[\s\S]*?\.layer-canvas canvas \{[\s\S]*?background: transparent !important/);
 assert.match(styles, /\.excalidraw-textEditorContainer \{[\s\S]*?z-index: 10030 !important/);
 assert.match(styles, /\.excalidraw-textEditorContainer textarea \{[\s\S]*?background: transparent !important/);
 assert.doesNotMatch(styles, /transform:\s*scale\(/);
});


test('Pages locks the Excalidraw camera and blocks viewport navigation gestures', async () => {
 const { readFile } = await import('node:fs/promises');
 const canvas = await readFile(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
 const pages = await readFile(new URL('../src/features/pages/CanvasPages.jsx', import.meta.url), 'utf8');
 const styles = await readFile(new URL('../src/features/pages/pages.css', import.meta.url), 'utf8');
 assert.match(canvas, /root\.addEventListener\("wheel", stopViewportGesture, \{ capture: true, passive: false \}\)/);
 assert.match(canvas, /root\.addEventListener\("touchmove", stopViewportGesture, \{ capture: true, passive: false \}\)/);
 assert.match(canvas, /event\.button === 1/);
 assert.match(canvas, /event\.code !== "Space"/);
 assert.match(canvas, /scrollX: 0,[\s\S]*?scrollY: 0,[\s\S]*?zoom: \{ value: 1 \}/);
 assert.match(canvas, /activeTool: \{ type: "selection" \}/);
 assert.match(styles, /\.app\[data-canvas-view="pages"\] \.desktop-canvas-region[\s\S]*?overflow: hidden !important/);
 assert.match(styles, /overscroll-behavior: none !important/);
 assert.match(styles, /touch-action: none !important/);
 assert.match(styles, /toolbar-hand/);
 assert.match(styles, /\.app\[data-canvas-view="pages"\] \.sketchizi-grid-spotlight/);
 assert.match(canvas, /const showGrid = !!gridEnabled && pageContext\?\.mode !== "pages"/);
 assert.match(styles, /Scroll back to content/);
 assert.doesNotMatch(pages, /<button[^>]*>Fit<\/button>/);
 assert.match(pages, /moveChapter\(targetPage, 0, 0\)/);
 assert.match(pages, /scrollX: 0, scrollY: 0, zoom: \{ value: 1 \}/);
});


test('Pages browser smoke verifies the editorial summary, header chapter controller, and clean canvas perimeter', async () => {
 const { readFile } = await import('node:fs/promises');
 const smoke = await readFile(new URL('../scripts/browser-page-canvas-smoke.mjs', import.meta.url), 'utf8');
 assert.match(smoke, /getByRole\('textbox', \{ name: 'Chapter subtitle' \}\)/);
 assert.match(smoke, /customData\?\.tagline === 'Capacity planning and traffic assumptions'/);
 assert.doesNotMatch(smoke, /Key formula or rule of thumb|23,150 QPS/);
 assert.match(smoke, /pages-chapter-eyebrow/);
 assert.match(smoke, /pages-bottom-actions/);
 assert.match(smoke, /Chapter index popover must open downward/);
 assert.match(smoke, /Pages mode must not render a floating bottom action container/);
 assert.match(smoke, /Dark-theme chapter index popover must also open downward/);
 assert.match(smoke, /repeating-linear-gradient/);
 assert.match(smoke, /radial-gradient/);
 assert.match(smoke, /rgb\(15, 20, 29\)/);
});

test('Pages tabs are routed by tab identity and repaired before the Pages workspace renders', async () => {
 const { readFile } = await import('node:fs/promises');
 const app = await readFile(new URL('../src/App.jsx', import.meta.url), 'utf8');
 const tabs = await readFile(new URL('../src/hooks/useWorkspaceTabs.js', import.meta.url), 'utf8');
 const modeIcon = await readFile(new URL('../src/features/workspace/WorkspaceModeIcon.jsx', import.meta.url), 'utf8');
 const pages = await readFile(new URL('../src/features/pages/CanvasPages.jsx', import.meta.url), 'utf8');
 const header = await readFile(new URL('../src/components/app/DesktopAppHeader.jsx', import.meta.url), 'utf8');
 assert.match(tabs, /function createDefaultPagesSnapshot\(api, existingChapter = null\)/);
 assert.match(tabs, /type: isPagesTab \? "pages" : requestedType/);
 assert.match(tabs, /setActiveCanvasTabType,/);
 assert.match(tabs, /if \(isPagesTab && getPages\(storedElements\)\.length === 0\)/);
 assert.match(tabs, /const hasPageChapters =/);
 assert.match(tabs, /if \(normalized\.type\) return normalized/);
 assert.match(tabs, /localStorage\.setItem\("sketchizi\.active-workspace-tab-mode"/);
 assert.match(modeIcon, /tab\?\.type === "pages"/);
 assert.match(modeIcon, /if \(tab\?\.type === "canvas"\) return "canvas"/);
 assert.doesNotMatch(modeIcon, /pageMode === "pages"/);
 assert.match(header, /workspaceMode=\{workspaceMode\}/);
 assert.match(pages, /workspaceMode = "infinite"/);
 assert.match(pages, /changeMode\(nextMode, false\)/);
 assert.match(pages, /onWorkspaceModeChange\?\.\(value\)/);
 assert.match(pages, /const fallbackPage = mode === "pages" && pages\.length === 0/);
 assert.match(pages, /const displayPages = pages\.length \? pages : \(fallbackPage \? \[fallbackPage\] : \[\]\)/);
 assert.match(pages, /pageMaskForRender = fallbackPage \? fallbackPageMask : pageMask/);
 assert.match(pages, /const livePages = api\?\.getSceneElementsIncludingDeleted\?\.\(\) \|\| \[\]/);
 assert.match(app, /workspaceMode=\{canvasTabsReady \? getWorkspaceTabMode/);
 assert.match(app, /pageContext=\{\{ \.\.\.canvasPageContext, mode: \(canvasTabsReady/);
});
