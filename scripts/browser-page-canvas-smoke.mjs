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
 const buttonName = mode === 'pages' ? /Pages Organize/ : /Infinite canvas Draw/;
 await page.getByRole('button', { name: buttonName }).click();
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
 if (await reveal.getAttribute('aria-expanded') !== 'true') await reveal.click({ force: true });
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
 await page.locator('.canvas-tab-status-dot.is-saved').waitFor({state:'attached',timeout:20000});
 await chooseStartupPages();
 await ensureHeaderVisible();
 // The canvas document menu must make every save/download/export action obvious.
 assert.equal(await page.getByRole('button',{name:'Rename canvas'}).count(),1,'Rename must sit beside the active canvas title');
 await page.getByRole('button',{name:'Canvas options'}).click();
 const documentMenu = page.getByRole('dialog',{name:'Canvas options'});
 await documentMenu.waitFor({state:'visible'});
 for (const action of ['Save locally','Save to Cloud Workspace','Save to file','Download recovery backup','Export canvas']) {
  assert.equal(await documentMenu.getByRole('button',{name:new RegExp(action,'i')}).count(),1,action+' must be discoverable in the canvas menu');
 }
 assert(await documentMenu.getByText('Save & sync',{exact:true}).count()===1,'Save actions must have a clear section heading');
 assert(await documentMenu.getByText('Download & export',{exact:true}).count()===1,'Download and export actions must have a clear section heading');
 await page.getByRole('button',{name:'Canvas options'}).click();
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
 assert.deepEqual(errors,[]);
 console.log('PASS: single selector, page grid/name, dock, drag resize, light/dark sync, page creation/navigation, persistence and infinite-canvas return');
} catch (error) {
 await page.screenshot({path:'/tmp/sketchizi-page-failure.png'});
 console.error('Page diagnostics:', await page.locator('body').innerText(), errors);
 throw error;
} finally { await browser.close(); }
