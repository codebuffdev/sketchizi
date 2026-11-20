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
 if (await reveal.getAttribute('aria-expanded') !== 'true') {
  // Floating controls may overlap the collapsed handle for pointer input.
  // DOM click still invokes the component's actual React handler.
  await reveal.evaluate(button => button.click());
 }
 await page.waitForFunction(() => document.querySelector('.desktop-app-header-reveal-handle')?.getAttribute('aria-expanded') === 'true');
}
try {
 await page.route('**/api/**',r=>r.fulfill({json:{authenticated:false,user:null}}));
 await page.goto(`${process.env.SKETCHIZI_BASE_URL || 'http://127.0.0.1:4173'}/?editor=1`);
 await page.locator('.excalidraw').waitFor();
 await page.locator('.desktop-app-document-identity-dirty-dot.is-saved').waitFor({state:'attached',timeout:20000});
 await chooseStartupPages();
 await ensureHeaderVisible();
 assert.equal(await canvasStyle().count(),1,'Pages controller must render only one canvas selector');
 await canvasStyle().click();
 page.once('dialog',dialog=>dialog.accept('Cover'));
 await page.getByRole('button',{name:/Pages Organize/}).click();
 await page.getByRole('navigation',{name:'Page navigation'}).waitFor();
 let es = await waitScene(es=>pages(es).length===1);
 assert.equal(pages(es)[0].width,1600); assert.equal(pages(es)[0].height,1400);
 assert.equal(await page.locator('.canvas-pages-page-name').innerText(),'Cover');
 assert(await page.locator('.canvas-pages-page-grid').evaluate(el=>getComputedStyle(el).backgroundImage!=='none'),'Page interior grid must be visible');
 const dock = await page.locator('.App-toolbar-container').boundingBox();
 assert(dock && dock.width>0 && dock.height>0,'Drawing dock must remain visible in Pages mode');
 // Drag the visible southeast page handle and verify the frame and paper resize together.
 const beforeWidth = pages(es)[0].width;
 const handle = await page.locator('.canvas-pages-resize-handle.is-se').boundingBox();
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
 await page.keyboard.press('r');
 await page.mouse.move(650,450); await page.mouse.down(); await page.mouse.move(760,540,{steps:10}); await page.mouse.up();
 es = await waitScene(es=>es.some(e=>e.type==='rectangle' && !e.customData?.sketchiziPagePaper && e.frameId===pages(es)[0]?.id));
 // Add and name a second page through the page navigation control.
 page.once('dialog',dialog=>dialog.accept('Details'));
 await page.locator('.canvas-pages-add').click();
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
 await canvasStyle().click();
 await page.getByRole('button',{name:/Infinite canvas Draw/}).click();
 assert.equal(await page.getByRole('navigation',{name:'Page navigation'}).count(),0);
 assert.equal(await page.locator('.canvas-pages-mask').count(),0,'Infinite canvas must remove the Pages mask');
 assert.equal(pages(await scene()).length,2,'Switching views must preserve all pages');
 // Re-enter Pages mode, then verify the selector remains usable on narrow screens.
 await canvasStyle().click();
 await page.getByRole('button',{name:/Pages Organize/}).click();
 await page.getByRole('navigation',{name:'Page navigation'}).waitFor();
 await page.setViewportSize({width:390,height:844});
 await canvasStyle().click();
 const menu=await page.getByRole('dialog',{name:'Canvas style'}).boundingBox();
 assert(menu.x>=0 && menu.x+menu.width<=390);
 await page.getByRole('button',{name:/Infinite canvas Draw/}).click();
 await page.screenshot({path:'/tmp/sketchizi-page-mobile.png'});
 await page.setViewportSize({width:1440,height:1000});
 await canvasStyle().click();
 await page.getByRole('button',{name:/Pages Organize/}).click();
 await page.getByRole('button',{name:'Fit page',exact:true}).click();
 await page.screenshot({path:'/tmp/sketchizi-page-desktop.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: single selector, page grid/name, dock, drag resize, light/dark sync, page creation/navigation, persistence and infinite-canvas return');
} catch (error) {
 await page.screenshot({path:'/tmp/sketchizi-page-failure.png'});
 console.error('Page diagnostics:', await page.locator('body').innerText(), errors);
 throw error;
} finally { await browser.close(); }
