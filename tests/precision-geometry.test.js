import test from "node:test";
import assert from "node:assert/strict";
import {
  cmToScenePx, scenePxToCm, snapToIncrement, constrainSquare,
  constrainLineAngle, lineAngleDegrees, getShapePrecision,
} from "../src/features/canvas/precisionGeometry.js";

test("centimeter conversions round-trip in scene units", () => {
  assert.ok(Math.abs(scenePxToCm(cmToScenePx(12.5)) - 12.5) < 1e-10);
  assert.equal(cmToScenePx(-1), null);
});
test("grid snapping handles negative coordinates", () => {
  assert.equal(snapToIncrement(26, 10), 30);
  assert.equal(snapToIncrement(-26, 10), -30);
  assert.equal(snapToIncrement(26, 0), 26);
});
test("square constraint preserves drag direction", () => {
  assert.deepEqual(constrainSquare({x: 10,y:10},{x: 4,y: 7}), {x:4,y:4});
});
test("line angle snaps to 15-degree increments without changing length", () => {
  const p = constrainLineAngle({x:0,y:0},{x:10,y:2},15);
  assert.ok(Math.abs(lineAngleDegrees({x:0,y:0},p) - 15) < 1e-8);
  assert.ok(Math.abs(Math.hypot(p.x,p.y) - Math.hypot(10,2)) < 1e-8);
});
test("ellipse and polyline measurements use scene geometry", () => {
  const ellipse = getShapePrecision({type:"ellipse",width:200,height:100});
  assert.equal(ellipse.kind,"ellipse");
  assert.ok(ellipse.radiusXcm > ellipse.radiusYcm);
  const line = getShapePrecision({type:"line",points:[[0,0],[30,0],[30,40]]});
  assert.equal(line.kind,"linear");
  assert.ok(Math.abs(line.lengthCm - scenePxToCm(70)) < 1e-10);
  assert.equal(line.angleDegrees,90);
});
