import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:2});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
async function scene() {
 return page.evaluate(async () => {
  const db = await new Promise((resolve,reject) => { const r=indexedDB.open('sketchizi-local-state'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); });
  try { return await new Promise((resolve,reject)=> {
   const r=db.transaction('documents','readonly').objectStore('documents').get('canvas-tabs-manifest');
   r.onsuccess=()=>{ const tabs=r.result?.tabs||[]; const active=tabs.find(tab=>tab.active)||tabs[0]; resolve(active?.snapshot?.elements?.filter(e=>!e.isDeleted)||[]); };
   r.onerror=()=>reject(r.error);
  }); } finally { db.close(); }
 });
}
async function waitScene(predicate) {
 const deadline=Date.now()+20000;
 while(Date.now()<deadline) { try { const elements=await scene(); if(predicate(elements)) return elements; } catch {} await page.waitForTimeout(200); }
 throw new Error('Expected page scene was not persisted: '+JSON.stringify(await scene()));
}
async function renameActivePage(name) {
 await page.getByRole('textbox', { name: 'Chapter title' }).fill(name);
 await waitScene(elements => pages(elements).some(item => item.name === name));
}
async function chooseCanvasMode(mode) {
 await ensureHeaderVisible();
 await canvasStyle().click();
 const optionLabel = mode === 'pages' ? 'Pages' : 'Infinite canvas';
 await page.getByText(optionLabel, { exact: true }).click();
 if (mode === 'pages') await page.getByRole('navigation', { name: 'Chapter navigation' }).waitFor();
 else await page.getByRole('navigation', { name: 'Chapter navigation' }).waitFor({ state: 'detached' });
}
const pages = es => es.filter(e=>e.type==='frame' && e.customData?.sketchiziPage);
const canvasStyle = () => page.getByRole('button',{name:'Canvas style',exact:true});
async function chooseStartupPages() {
 const title = page.getByRole('heading', { name: 'Start with' });
 // The editor's saved indicator can render before the startup chooser. Wait
 // for the chooser instead of accidentally proceeding underneath its backdrop.
 await title.waitFor({ state: 'visible', timeout: 20000 });
 const chooser = page.locator('.startup-canvas-chooser');
 await chooser.locator('.startup-canvas-option').nth(1).click();
 await chooser.waitFor({ state: 'detached', timeout: 15000 });
}
async function ensureHeaderVisible() {
 const reveal = page.locator('.desktop-app-header-reveal-handle');
 await reveal.waitFor({ state: 'attached', timeout: 15000 });
 if (await page.locator('.desktop-app-header').getAttribute('aria-hidden') !== 'false') {
  await reveal.click({ force: true });
 }
 await page.waitForFunction(() => document.querySelector('.desktop-app-header')?.getAttribute('aria-hidden') === 'false');
 // The header auto-hides after canvas interaction; reveal it on demand instead of
 // depending on a pinned state that can vary across desktop header layouts.
}
async function closeAiAskIfOpen() {
 const toggle = page.getByRole('button', { name: 'AI Ask', exact: true });
 if (await toggle.getAttribute('aria-expanded') === 'true') await toggle.click({ force: true });
 await page.waitForFunction(() => !document.querySelector('.app')?.classList.contains('ai-ask-open'));
}
try {
 await page.route('**/api/**',r=>r.fulfill({json:{authenticated:false,user:null}}));
 await page.goto(`${process.env.SKETCHIZI_BASE_URL || 'http://127.0.0.1:4173'}/?editor=1`);
 await page.locator('.excalidraw').waitFor();
 await chooseStartupPages();
 await ensureHeaderVisible();
 // The canvas document menu must make every save/download/export action obvious.
 assert.equal(await page.getByRole('button',{name:'Rename canvas'}).count(),1,'Rename must sit beside the active canvas title');
 await ensureHeaderVisible();
 await page.getByRole('button',{name:'Canvas options'}).click();
 const documentMenu = page.getByRole('dialog',{name:'Canvas options'});
 await documentMenu.waitFor({state:'visible'});
 for (const action of ['Save locally','Save to Cloud Workspace','Save to file','Download recovery backup','Export studio']) {
  assert.equal(await documentMenu.getByRole('button',{name:new RegExp(action,'i')}).count(),1,action+' must be discoverable in the canvas menu');
 }
 assert(await documentMenu.getByText('Save & sync',{exact:true}).count()===1,'Save actions must have a clear section heading');
 assert(await documentMenu.getByText('Download & export',{exact:true}).count()===1,'Download and export actions must have a clear section heading');
 await page.getByRole('button',{name:'Canvas options'}).click();
 await documentMenu.waitFor({state:'detached'});
 assert.equal(await canvasStyle().count(),1,'Header must render one Canvas style control');
 await chooseCanvasMode('pages');
 await page.getByRole('navigation',{name:'Chapter navigation'}).waitFor();
 let es = await waitScene(es=>pages(es).length===1);
 const initialPage = pages(es)[0];
 assert(initialPage.width > 0 && initialPage.height > 0, 'New page must have usable dimensions');
 assert.equal(initialPage.width, 1440, 'New chapter must span the full viewport width');
 assert.equal(initialPage.height, 1000, 'New chapter must span the full viewport height');
 assert.equal(await page.getByRole('button', { name: 'Standard', exact: true }).count(), 0, 'Pages must not expose boxed width presets');
 assert.equal(await page.getByRole('button', { name: 'Wide', exact: true }).count(), 0, 'Pages must not expose boxed width presets');
 // Assert the actual backing store is sized for a 2x HiDPI display, not CSS-scaled.
 const canvasMetrics = await page.evaluate(() => {
  const canvases = [...document.querySelectorAll('.desktop-canvas-region canvas')]
   .filter(el => el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
  const canvas = canvases.find(el => !String(el.className).includes('layer-ui')) || canvases[0];
  if (!canvas) return { dpr: window.devicePixelRatio, candidates: [...document.querySelectorAll('.desktop-canvas-region *')]
   .filter(el => String(el.className || '').includes('layer-canvas'))
   .map(el => ({ tag: el.tagName, className: String(el.className) })) };
  const rect = canvas.getBoundingClientRect();
  return {
   dpr: window.devicePixelRatio, width: canvas.width, height: canvas.height,
   cssWidth: rect.width, cssHeight: rect.height, className: String(canvas.className),
   candidates: canvases.map(el => ({ className: String(el.className), width: el.width, height: el.height })),
  };
 });
 assert(canvasMetrics && canvasMetrics.dpr === 2 && canvasMetrics.width > 0,
  'Browser smoke test must find a native 2x Excalidraw canvas: ' + JSON.stringify(canvasMetrics));
 assert(Math.abs(canvasMetrics.width - Math.round(canvasMetrics.cssWidth * canvasMetrics.dpr)) <= 2, 'Canvas backing width must match its physical HiDPI width');
 assert(Math.abs(canvasMetrics.height - Math.round(canvasMetrics.cssHeight * canvasMetrics.dpr)) <= 2, 'Canvas backing height must match its physical HiDPI height');
 const layerOrder = await page.evaluate(() => {
  const drawingCanvas = [...document.querySelectorAll('.desktop-canvas-region canvas')]
   .find(el => !String(el.className).includes('layer-ui')) ||
   document.querySelector('.desktop-canvas-region canvas');
  const layerUi = document.querySelector('.layer-ui__wrapper');
  return {
   sheet: getComputedStyle(document.querySelector('.pages-book-sheet')).zIndex,
   texture: getComputedStyle(document.querySelector('.pages-book-canvas-zone')).zIndex,
   drawing: drawingCanvas ? getComputedStyle(drawingCanvas).zIndex : null,
   ui: layerUi ? getComputedStyle(layerUi).zIndex : null,
   header: getComputedStyle(document.querySelector('.pages-book-ui')).zIndex,
  };
 });
 assert.equal(layerOrder.sheet, '0');
 assert.equal(layerOrder.texture, '0');
 assert.equal(layerOrder.drawing, '1');
 assert.equal(layerOrder.header, '10040');
 assert.match(await page.locator('.pages-chapter-eyebrow').innerText(), /^01\\s*·$/s, 'Eyebrow must show the page number and separator before its editable title input');
 assert.equal(await page.getByRole('textbox', { name: 'Book / notebook title' }).count(), 1, 'Book title must be inline editable in the eyebrow');
 const actions = page.locator('.pages-bottom-actions');
 const navigatorBounds = await actions.locator('.canvas-pages-navigation').boundingBox();
 const zenBounds = await actions.locator('.sk-zen-pill').boundingBox();
 assert(navigatorBounds && zenBounds && Math.abs(zenBounds.x - navigatorBounds.x - navigatorBounds.width - 10) <= 2,
  'Chapter navigator and Zen pill must sit in one row with a 10px gap');
 const dotsStyle = await page.locator('.pages-book-canvas-zone').evaluate(el => ({
  image: getComputedStyle(el).backgroundImage,
  size: getComputedStyle(el).backgroundSize,
 }));
 assert(dotsStyle.image.includes('radial-gradient') && dotsStyle.size === '22px 22px',
  'Dots paper must render its 22px radial grid');
 // The eyebrow book title is the active top-tab name and renames that tab on commit.
 const bookTitleInput = page.getByRole('textbox', { name: 'Book / notebook title' });
 assert.equal(await bookTitleInput.inputValue(), 'Canvas 1', 'Eyebrow book title must initialize from the active canvas tab');
 await bookTitleInput.fill('System Design Notes');
 await bookTitleInput.press('Enter');
 await page.waitForFunction(() => document.querySelector('.canvas-tab.is-active .canvas-tab-name')?.textContent.trim() === 'System Design Notes');
 // Typing in the page heading must remain native input text, not an Excalidraw shortcut.
 const chapterTitleInput = page.getByRole('textbox', { name: 'Chapter title' });
 assert.equal(await chapterTitleInput.inputValue(), 'Untitled Page', 'New page heading must default to Untitled Page');
 await chapterTitleInput.fill('Untitled Page');
 await chapterTitleInput.press('s');
 assert.equal(await chapterTitleInput.inputValue(), 'Untitled Pages', 'Page title input must receive shortcut-like characters without Excalidraw interception');
 // The editable editorial heading is also the canonical chapter name.
 await chapterTitleInput.fill('Cover');
 es = await waitScene(elements => pages(elements)[0]?.name === 'Cover');
 // Exercise inline editorial metadata and per-chapter paper texture persistence.
 await page.getByRole('textbox', { name: 'Chapter title' }).fill('Cover chapter');
 es = await waitScene(es => pages(es)[0]?.customData?.chapterTitle === 'Cover chapter');
 await page.getByRole('textbox', { name: 'Chapter subtitle' }).fill('Capacity planning and traffic assumptions');
 es = await waitScene(es => pages(es)[0]?.customData?.tagline === 'Capacity planning and traffic assumptions');
 await page.getByRole('button', { name: 'Ruled', exact: true }).click();
 es = await waitScene(es => pages(es)[0]?.customData?.paperTexture === 'Ruled');
 assert(await page.locator('.pages-book-canvas-zone').evaluate(el=>getComputedStyle(el).backgroundImage.includes('repeating-linear-gradient')), 'Ruled paper must render repeating horizontal lines');
 await page.getByRole('button', { name: 'Dots', exact: true }).click();
 es = await waitScene(es => pages(es)[0]?.customData?.paperTexture === 'Dots');
 assert(await page.locator('.pages-book-canvas-zone').evaluate(el=>getComputedStyle(el).backgroundImage.includes('radial-gradient')), 'Dots paper must render its radial pattern');
 await page.locator('.pages-mark-read').click();
 es = await waitScene(es => pages(es)[0]?.customData?.completed === true);
 assert(await page.locator('.pages-book-canvas-zone.texture-dots').evaluate(el=>getComputedStyle(el).backgroundImage!=='none'),'Editorial dot texture must be visible');
 const dock = await page.getByRole('navigation',{name:'Drawing tools'}).boundingBox();
 assert(dock && dock.width>0 && dock.height>0,'Drawing dock must remain visible in Pages mode');
 // The full-bleed paper and canvas must occupy the complete desktop viewport.
 const sheetBounds = await page.locator('.pages-book-sheet').boundingBox();
 const canvasBounds = await page.locator('.desktop-canvas-region').boundingBox();
 assert.deepEqual({ width: Math.round(sheetBounds.width), height: Math.round(sheetBounds.height) }, { width: 1440, height: 1000 });
 assert.deepEqual({ width: Math.round(canvasBounds.width), height: Math.round(canvasBounds.height) }, { width: 1440, height: 1000 });
 assert.equal(await page.locator('.canvas-pages-resize-hit').count(), 0, 'Full-bleed chapters must not expose page resize grips');
 assert.equal(await page.getByRole('button', { name: 'Fit', exact: true }).count(), 0, 'A permanently fitted chapter must not expose a Fit action');
 const fixedSheetBeforeScroll = await page.locator('.pages-book-sheet').boundingBox();
 await page.mouse.move(900, 760);
 await page.mouse.wheel(0, 900);
 await page.waitForTimeout(250);
 assert.equal(await page.evaluate(() => window.scrollY), 0, 'Wheel input must not scroll the document in Pages mode');
 assert.deepEqual(await page.locator('.pages-book-sheet').boundingBox(), fixedSheetBeforeScroll, 'Wheel input must not move the full-bleed chapter sheet');
 assert.equal(await page.getByRole('button', { name: 'Scroll back to content', exact: true }).count(), 0, 'Pages mode must not show Excalidraw scroll-back affordance');
 // Verify both themes update the Pages workspace without leaving the mode.
 await ensureHeaderVisible();
 await page.getByRole('button',{name:'Appearance and canvas background'}).click();
 await page.getByRole('button',{name:'Light',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.app')?.classList.contains('theme-light'));
 assert.equal(await page.locator('.pages-book-sheet').evaluate(el=>getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)', 'Full-bleed paper must switch to the light theme');
 await page.getByRole('button',{name:'Dark',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.app')?.classList.contains('theme-dark'));
 assert.equal(await page.locator('.pages-book-sheet').evaluate(el=>getComputedStyle(el).backgroundColor), 'rgb(15, 20, 29)', 'Full-bleed paper must switch to the dark theme');
 await ensureHeaderVisible();
 await page.getByRole('button',{name:'Appearance and canvas background'}).click();
 // Draw through the actual canvas, then ensure the new shape belongs to this page.
 await page.mouse.click(500,400); // Focus the canvas before using its tool shortcut.
 await page.keyboard.press('r');
 await page.mouse.move(650,450); await page.mouse.down(); await page.mouse.move(760,540,{steps:10}); await page.mouse.up();
 es = await waitScene(es=>es.some(e=>e.type==='rectangle' && !e.customData?.sketchiziPagePaper && e.frameId===pages(es)[0]?.id));
 // Add and name a second page through the page navigation control.
 await page.locator('.canvas-pages-add').click();
 es = await waitScene(es=>pages(es).length===2);
 await renameActivePage('Details');
 es = await waitScene(es=>pages(es).length===2 && pages(es).some(p=>p.name==='Details'));
 const activeDetails = pages(es).find(p => p.name === 'Details');
 const parkedCover = pages(es).find(p => p.name === 'Cover chapter');
 assert.deepEqual({ x: activeDetails.x, y: activeDetails.y }, { x: 0, y: 0 }, 'New chapter must occupy the locked viewport origin');
 assert(parkedCover.x > 0, 'Inactive chapter must be parked outside the active viewport');
 await page.mouse.move(1100, 820);
 await page.mouse.wheel(0, -700);
 await page.waitForTimeout(200);
 assert.equal(await page.evaluate(() => window.scrollY), 0);
 assert.equal(await page.getByRole('button', { name: 'Scroll back to content', exact: true }).count(), 0);
 const navigation=page.getByRole('navigation',{name:'Chapter navigation'});
 await navigation.getByRole('button',{name:'Previous chapter'}).click();
 await page.waitForFunction(()=>document.querySelector('.canvas-pages-navigation')?.textContent.includes('01 / 02'));
 assert.equal(await page.getByRole('textbox', { name: 'Chapter title' }).inputValue(),'Cover chapter');
 await navigation.getByRole('button',{name:'Next chapter'}).click();
 await page.waitForFunction(()=>document.querySelector('.canvas-pages-navigation')?.textContent.includes('02 / 02'));
 assert.equal(await page.getByRole('textbox', { name: 'Chapter title' }).inputValue(),'Details');
 await page.reload();
 await page.getByRole('navigation',{name:'Chapter navigation'}).waitFor();
 await ensureHeaderVisible();
 await closeAiAskIfOpen();
 await chooseCanvasMode('infinite');
 assert.equal(await page.getByRole('navigation',{name:'Chapter navigation'}).count(),0);
 assert.equal(await page.locator('.canvas-pages-mask').count(),0,'Infinite canvas must remove the Pages mask');
 assert.equal(pages(await scene()).length,2,'Switching views must preserve all pages');
 // Re-enter Pages mode through the same workspace choice event used by startup.
 await chooseCanvasMode('pages');
 await page.setViewportSize({width:390,height:844});
 es = await waitScene(elements => pages(elements).some(item => item.width === 390 && item.height === 844));
 const mobilePage = pages(es).find(item => item.width === 390 && item.height === 844);
 assert(mobilePage, 'The active chapter must resize to the mobile viewport');
 const mobilePaper = es.find(e => e.customData?.sketchiziPagePaper === mobilePage.id);
 assert.equal(mobilePaper?.width, 390, 'Paper backing must resize with the mobile chapter frame');
 assert.equal(mobilePaper?.height, 844, 'Paper backing must match the mobile viewport height');
 await ensureHeaderVisible();
 await canvasStyle().click();
 const menu=await page.getByRole('dialog',{name:'Canvas style'}).boundingBox();
 assert(menu.x>=0 && menu.x+menu.width<=390);
 await page.mouse.click(4,400); // Outside the edge-to-edge phone popup.
 await page.getByRole('dialog',{name:'Canvas style'}).waitFor({state:'detached'});
 await chooseCanvasMode('infinite');
 await page.screenshot({path:'/tmp/sketchizi-page-mobile.png'});
 await page.setViewportSize({width:1440,height:1000});
 await ensureHeaderVisible();
 await chooseCanvasMode('pages');
 assert.equal(await page.getByRole('button', { name: 'Fit', exact: true }).count(), 0);
 await page.screenshot({path:'/tmp/sketchizi-page-desktop.png'});

 // Exercise the restored document-tab Export Studio against a real System Design graph.
 await page.keyboard.press('Control+K');
 const palette = page.locator('.sketchizi-command-palette');
 await palette.waitFor({state:'visible'});
 await page.keyboard.type('system design');
 await palette.getByText(/Open System Design Studio/i).click();
 const studio = page.getByTestId('system-design-studio');
 await studio.waitFor({state:'visible'});
 const workspaceToolbar = page.getByRole('toolbar',{name:'System design workspace'});
 await workspaceToolbar.getByRole('button',{name:'Blueprints'}).click();
 const blueprintMenu = page.getByRole('menu',{name:'Starter architectures'});
 await blueprintMenu.getByRole('menuitem').first().click();
 await studio.locator('[data-node-id]').first().waitFor({state:'visible'});
 await ensureHeaderVisible();
 await page.getByRole('button',{name:'Canvas options'}).click();
 const exportMenu = page.getByRole('dialog',{name:'Canvas options'});
 await exportMenu.getByRole('button',{name:/Export studio/i}).click();
 const exportStudio = page.getByRole('dialog',{name:'Export Studio'});
 await exportStudio.waitFor({state:'visible'});
 await exportStudio.getByText('Diagram preview',{exact:true}).waitFor({state:'visible'});
 await exportStudio.locator('.sketchizi-system-export-preview svg [data-node-id]').first().waitFor({state:'visible'});
 await exportStudio.getByRole('button',{name:'Download PNG'}).waitFor({state:'visible'});
 await exportStudio.getByRole('button',{name:'Download SVG'}).waitFor({state:'visible'});
 await exportStudio.getByRole('button',{name:'Close export studio'}).click();

 // The Excalidraw WORKSPACE hamburger keeps both built-in actions stripped.
 await ensureHeaderVisible();
 await page.getByRole('button',{name:'Open application menu'}).click();
 const workspaceMenu = page.locator('.dropdown-menu-container').first();
 await workspaceMenu.waitFor({state:'visible'});
 await page.waitForFunction(() => { const blocked = new Set(["Export image", "Export image...", "Export image…", "Find on canvas"]); return ![...document.querySelectorAll(".dropdown-menu-container *")].some(node => node.children.length === 0 && blocked.has(node.textContent.trim())); });
 assert.equal(await workspaceMenu.getByText('Export image...',{exact:true}).count(),0,'Hamburger must not expose Export image');
 assert.equal(await workspaceMenu.getByText('Find on canvas',{exact:true}).count(),0,'Hamburger must not expose Find on canvas');
 assert(await workspaceMenu.getByText(/Reset (the )?canvas/i).count()>=1,'Hamburger must retain Reset canvas');
 await page.getByRole('button',{name:'Close application menu'}).click();

 assert.deepEqual(errors,[]);
 console.log('PASS: pages canvas plus document Export Studio live System Design preview, while native hamburger image export/find stay removed');
} catch (error) {
 await page.screenshot({path:'/tmp/sketchizi-page-failure.png'});
 console.error('Page diagnostics:', await page.locator('body').innerText(), errors);
 throw error;
} finally { await browser.close(); }
