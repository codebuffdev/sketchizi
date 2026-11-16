import test from 'node:test';
import assert from 'node:assert/strict';
import { getPages, validSize, pageSkeleton, DEFAULT_PAGE_SIZE } from '../src/features/pages/pageModel.js';
test('adding a page preserves existing artwork and places the sheet beyond its bounds', () => {
 const existing = [{id:'drawing',type:'rectangle',x:100,y:40,width:500,height:20}];
 const snapshot = structuredClone(existing);
 const [paper,page] = pageSkeleton(existing,DEFAULT_PAGE_SIZE,'new-page');
 assert.deepEqual(existing,snapshot);
 assert(paper.x > 600);
 assert.equal(page.width,1600); assert.equal(page.height,1400);
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
