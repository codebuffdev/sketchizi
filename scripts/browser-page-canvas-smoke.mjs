import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
async function scene() {
 return page.evaluate(async () => {
  const db = await new Promise((resolve,reject) => { const r=indexedDB.open('sketchizi-local-state'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error); });
  try { return await new Promise((resolve,reject)=> { const r=db.transaction('documents','readonly').objectStore('documents').get('main'); r.onsuccess=()=>resolve(r.result?.elements?.filter(e=>!e.isDeleted)||[]); r.onerror=()=>reject(r.error); }); } finally { db.close(); }
 });
}
async function waitScene(predicate) {
 const deadline=Date.now()+20000;
 while(Date.now()<deadline) { try { const elements=await scene(); if(predicate(elements)) return elements; } catch {} await page.waitForTimeout(200); }
 throw new Error('Expected page scene was not persisted: '+JSON.stringify(await scene()));
}
async function renameActivePage(name) {
 await page.locator('.canvas-pages-page-name').click();
 const input = page.getByRole('textbox', { name: 'Edit page name' });
 await input.fill(name);
 await input.press('Enter');
 await page.waitForFunction(expected => document.querySelector('.canvas-pages-page-name')?.textContent?.trim() === expected, name);
}
async function chooseCanvasMode(mode) {
 await canvasStyle().click();
 const optionLabel = mode === 'pages' ? 'Pages' : 'Infinite canvas';
 await page.getByText(optionLabel, { exact: true }).click();
 if (mode === 'pages') await page.getByRole('navigation', { name: 'Page navigation' }).waitFor();
 else await page.getByRole('navigation', { name: 'Page navigation' }).waitFor({ state: 'detached' });
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
 const pin = page.locator('.desktop-app-header-pin-button');
 if (await pin.getAttribute('aria-pressed') !== 'true') await pin.click({ force: true });
 await page.waitForFunction(() => document.querySelector('.desktop-app-header-pin-button')?.getAttribute('aria-pressed') === 'true');
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
 const activeTabTitle = page.locator('.canvas-tab-item.is-active .canvas-tab-name');
 assert.equal(await activeTabTitle.count(),1,'The active tab must expose its title');
 await activeTabTitle.dblclick();
 await page.locator('.canvas-tab-rename-input').waitFor({state:'visible'});
 await page.locator('.canvas-tab-rename-input').press('Escape');
 const tabActions = page.locator('.canvas-tab-item.is-active .canvas-tab-menu-trigger');
 await tabActions.click();
 const documentMenu = page.locator('.canvas-tabs-tab-menu-portal');
 await documentMenu.waitFor({state:'visible'});
 for (const action of ['Save locally','Save to Cloud Workspace','Save to file','Recovery backup','Export studio']) {
  assert.equal(await documentMenu.getByRole('button',{name:new RegExp(action,'i')}).count(),1,action+' must be discoverable in the canvas menu');
 }
 assert(await documentMenu.getByText('Save & sync',{exact:true}).count()===1,'Save actions must have a clear section heading');
 assert(await documentMenu.getByText('Export',{exact:true}).count()===1,'Download and export actions must have a clear section heading');
 await tabActions.click();
 await documentMenu.waitFor({state:'detached'});
 assert.equal(await canvasStyle().count(),1,'Header must render one Canvas style control');
 await chooseCanvasMode('pages');
 await page.getByRole('navigation',{name:'Page navigation'}).waitFor();
 let es = await waitScene(es=>pages(es).length===1);
 const initialPage = pages(es)[0];
 assert(initialPage.width > 0 && initialPage.height > 0, 'New page must have usable dimensions');
 assert(Math.abs(initialPage.width / initialPage.height - 55 / 27) < 0.02, 'New page must preserve the configured 55:27 aspect ratio');
 assert(initialPage.width <= 1440 * 0.8 + 1 && initialPage.height <= 1000 * 0.8 + 1, 'New page must fit within 80% of the available viewport');
 // Rename through the visible page-name editor rather than relying on a
 // removed prompt-based page-creation flow.
 await page.locator('.canvas-pages-page-name').click();
 const pageNameInput = page.getByRole('textbox',{name:'Edit page name'});
 await pageNameInput.fill('Cover');
 await pageNameInput.press('Enter');
 await page.waitForFunction(()=>document.querySelector('.canvas-pages-page-name')?.textContent.trim()==='Cover');
 assert(await page.locator('.canvas-pages-page-surface').evaluate(el=>getComputedStyle(el).backgroundImage!=='none'),'Page interior grid must be visible');
 const dock = await page.getByRole('navigation',{name:'Drawing tools'}).boundingBox();
 assert(dock && dock.width>0 && dock.height>0,'Drawing dock must remain visible in Pages mode');
 // Drag the visible southeast page handle and verify the frame and paper resize together.
 const beforeWidth = pages(es)[0].width;
 const handle = await page.locator('.canvas-pages-resize-hit.is-se').boundingBox();
 assert(handle,'Page resize handle must be visible');
 await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);
 await page.mouse.down();
 await page.mouse.move(handle.x+handle.width/2+36,handle.y+handle.height/2+28,{steps:8});
 await page.mouse.up();
 es = await waitScene(es=>pages(es)[0]?.width>beforeWidth);
 assert(es.find(e=>e.customData?.sketchiziPagePaper===pages(es)[0].id)?.width===pages(es)[0].width,'Page paper must track the resized frame');
 // Verify both themes update the Pages workspace without leaving the mode.
 await page.getByRole('button',{name:'Appearance and canvas background'}).click();
 await page.getByRole('button',{name:'Light',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.app')?.classList.contains('theme-light'));
 assert(await page.locator('.canvas-pages-mask-panel').first().evaluate(el=>getComputedStyle(el).backgroundColor!=='rgb(17, 24, 32)'));
 await page.getByRole('button',{name:'Dark',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.app')?.classList.contains('theme-dark'));
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
 const navigation=page.getByRole('navigation',{name:'Page navigation'});
 await navigation.getByRole('button').nth(0).click();
 await page.waitForFunction(()=>document.querySelector('.canvas-pages-navigation')?.textContent.includes('1 / 2'));
 assert.equal(await page.locator('.canvas-pages-page-name').innerText(),'Cover');
 await navigation.getByRole('button').nth(1).click();
 await page.waitForFunction(()=>document.querySelector('.canvas-pages-navigation')?.textContent.includes('2 / 2'));
 assert.equal(await page.locator('.canvas-pages-page-name').innerText(),'Details');
 await page.reload();
 await page.getByRole('navigation',{name:'Page navigation'}).waitFor();
 await ensureHeaderVisible();
 await closeAiAskIfOpen();
 await chooseCanvasMode('infinite');
 assert.equal(await page.getByRole('navigation',{name:'Page navigation'}).count(),0);
 assert.equal(await page.locator('.canvas-pages-mask').count(),0,'Infinite canvas must remove the Pages mask');
 assert.equal(pages(await scene()).length,2,'Switching views must preserve all pages');
 // Re-enter Pages mode through the same workspace choice event used by startup.
 await chooseCanvasMode('pages');
 await page.setViewportSize({width:390,height:844});
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
 await page.getByRole('button',{name:'Fit page',exact:true}).click();
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
 await tabActions.click();
 const exportMenu = page.locator('.canvas-tabs-tab-menu-portal');
 await exportMenu.getByRole('button',{name:/Export studio/i}).click();
 const exportStudio = page.getByRole('dialog',{name:'Export Studio'});
 await exportStudio.waitFor({state:'visible'});
 await exportStudio.getByText('Diagram preview',{exact:true}).waitFor({state:'visible'});
 await exportStudio.locator('.sketchizi-system-export-preview svg [data-node-id]').first().waitFor({state:'visible'});
 await exportStudio.getByRole('button',{name:'Download PNG'}).waitFor({state:'visible'});
 await exportStudio.getByRole('button',{name:'Download SVG'}).waitFor({state:'visible'});
 await exportStudio.getByRole('button',{name:'Close export studio'}).click();

 // The Excalidraw WORKSPACE hamburger keeps both built-in actions stripped.
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
