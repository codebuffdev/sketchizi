import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { smoothInkPoints, polishFinishedInk } from "../src/features/canvas/smartInkStrokePolish.js";

test("smooths pen jitter while preserving endpoints and pressure", () => {
  const input = [[0,0,0.2],[10,1,0.5],[20,-1,0.7],[30,0,0.4]];
  const output = smoothInkPoints(input);
  assert.strictEqual(output[0], input[0]);
  assert.strictEqual(output.at(-1), input.at(-1));
  assert.notDeepEqual(output[1].slice(0,2), input[1].slice(0,2));
  assert.equal(output[1][2], input[1][2]);
  assert.equal(output[2][2], input[2][2]);
});

test("does not erase deliberate corners or short pen marks", () => {
  const corner = [[0,0],[10,0],[10,10]];
  assert.strictEqual(smoothInkPoints(corner)[1], corner[1]);
  const dot = [[1,2,0.6]];
  assert.strictEqual(smoothInkPoints(dot), dot);
});

test("polishes only new freehand elements, without touching existing shapes", () => {
  const original = { id:"old",type:"freedraw",x:0,y:0,points:[[0,0],[10,1],[20,-1],[30,0]], version:1 };
  const incoming = { id:"new",type:"freedraw",x:3,y:4,points:[[0,0,0.5],[10,1,0.5],[20,-1,0.5],[30,0,0.5]],version:1 };
  const rectangle = { id:"box",type:"rectangle",x:9,y:9,width:20,height:20 };
  let scene = [original, incoming, rectangle];
  const known = new Set(["old"]);
  const calls = [];
  const api = {
    getSceneElements: () => scene,
    updateScene: (update) => { calls.push(update); scene = update.elements; },
  };
  assert.equal(polishFinishedInk(api, known, "never"), 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].captureUpdate, "never");
  assert.strictEqual(scene[0], original);
  assert.strictEqual(scene[2], rectangle);
  assert.equal(scene[1].version, 2);
  assert.equal(scene[1].customData.sketchiziInkPolished, true);
  assert.ok(known.has("new"));
  assert.equal(polishFinishedInk(api, known, "never"), 0);
  assert.equal(calls.length, 1);
});

test("Write mode cleans completed strokes and does not show repeated automatic OCR failure", () => {
  const picker = readFileSync(new URL("../src/components/app/SmartInkModePicker.jsx", import.meta.url), "utf8");
  assert.match(picker, /onInkFinish/);
  assert.match(picker, /pointerup/);
  assert.match(picker, /polishFinishedInk\(apiRef\?\.current/);
  assert.match(picker, /if \(!Array\.isArray\(automaticStrokes\)\) setMessage/);
  assert.match(picker, /live ink cleanup/);
});
