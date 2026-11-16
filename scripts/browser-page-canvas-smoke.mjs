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
try {
 await page.route('**/api/**',r=>r.fulfill({json:{authenticated:false,user:null}}));
 await page.goto(`${process.env.SKETCHIZI_BASE_URL || 'http://127.0.0.1:4173'}/?editor=1`);
 await page.locator('.excalidraw').waitFor();
 await page.getByRole('button',{name:/Local document save status: (Autosave ready|Saved locally)/}).waitFor({timeout:20000});
 await page.getByRole('button',{name:'Canvas options',exact:true}).click();
 await page.getByRole('button',{name:/Pages Organize/}).click();
 await page.getByRole('navigation',{name:'Page navigation'}).waitFor();
 let es = await waitScene(es=>pages(es).length===1);
 assert.equal(pages(es)[0].width,1600); assert.equal(pages(es)[0].height,1400);
 // Draw through the actual canvas, then ensure the new shape belongs to this page.
 await page.keyboard.press('r');
 await page.mouse.move(650,450); await page.mouse.down(); await page.mouse.move(760,540,{steps:10}); await page.mouse.up();
 es = await waitScene(es=>es.some(e=>e.type==='rectangle' && !e.customData?.sketchiziPagePaper && e.frameId===pages(es)[0]?.id));
 const originalId=pages(es)[0].id;
 await page.getByRole('button',{name:'Duplicate Page 1',exact:true}).click();
 es=await waitScene(es=>pages(es).length===2);
 assert(es.some(e=>!e.customData?.sketchiziPagePaper && e.type==='rectangle' && e.frameId && e.frameId!==originalId));
 page.once('dialog',dialog=>dialog.accept('Overview'));
 await page.getByRole('button',{name:'Rename Page 1',exact:true}).click();
 await waitScene(es=>pages(es).some(p=>p.name==='Overview'));
 await page.getByRole('button',{name:'Move Overview down',exact:true}).click();
 await waitScene(es=>pages(es).find(p=>p.name==='Overview')?.customData.pageOrder===2);
 await page.reload();
 await page.getByRole('button',{name:'Rename Overview',exact:true}).waitFor();
 await page.getByRole('button',{name:'Canvas options',exact:true}).click();
 await page.getByRole('button',{name:/Infinite canvas Draw/}).click();
 assert.equal(await page.getByRole('navigation',{name:'Page navigation'}).count(),0);
 assert.equal(pages(await scene()).length,2,'Switching views must preserve all pages');
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Canvas options',exact:true}).click();
 const menu=await page.getByRole('dialog',{name:'Canvas options'}).boundingBox();
 assert(menu.x>=0 && menu.x+menu.width<=390);
 await page.getByRole('button',{name:/Pages Organize/}).click();
 await page.screenshot({path:'/tmp/sketchizi-page-mobile.png'});
 await page.setViewportSize({width:1440,height:1000});
 await page.getByRole('button',{name:'Fit page',exact:true}).click();
 await page.screenshot({path:'/tmp/sketchizi-page-desktop.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: pages, drawing membership, duplication, rename, reorder, reload, infinite view and mobile selector');
} finally { await browser.close(); }
