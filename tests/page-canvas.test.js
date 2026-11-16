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
 assert.equal(page.width,1600); assert.equal(page.height,1400);
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

test('page fit keeps a visible workspace gutter and recenters the page', () => {
 const page = { x: 300, y: 100, width: 1600, height: 1400 };
 const viewport = { width: 1200, height: 900, zoom: { value: 0.5 }, scrollX: 0, scrollY: 0 };
 const fitted = getPageFitViewport(page, viewport, 0.82);
 assert.equal(fitted.zoom.value, 0.41);
 assert(Math.abs((page.x + fitted.scrollX + page.width / 2) * fitted.zoom.value - 600) < 1e-9);
 assert(Math.abs((page.y + fitted.scrollY + page.height / 2) * fitted.zoom.value - 450) < 1e-9);
 assert.equal(getPageFitViewport(page, viewport, 1), null);
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
