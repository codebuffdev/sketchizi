import test from 'node:test';
import assert from 'node:assert/strict';
import { snapChangedSceneElements } from '../src/features/canvas/gridSnap.js';

const rectangle = (id, x, y, width = 40, height = 20) => ({
  id, type: 'rectangle', x, y, width, height, angle: 0,
  version: 1, versionNonce: 1, updated: 1,
});
const baselineFor = (...elements) => new Map(elements.map((element) => [element.id, {
  x: element.x, y: element.y, width: element.width, height: element.height,
  angle: element.angle, type: element.type,
}]));

test('new shapes snap position and dimensions to the configured grid', () => {
  const input = [rectangle('new', 13, 27, 42, 37)];
  const output = snapChangedSceneElements(input, new Map(), 20);
  assert.deepEqual([output[0].x, output[0].y, output[0].width, output[0].height], [20, 20, 40, 40]);
  assert.equal(output[0].version, 2);
});

test('moving an existing shape snaps its location without changing its size', () => {
  const before = rectangle('shape', 0, 0);
  const moved = rectangle('shape', 13, 27, 40, 20);
  const output = snapChangedSceneElements([moved], baselineFor(before), 20);
  assert.deepEqual([output[0].x, output[0].y, output[0].width, output[0].height], [20, 20, 40, 20]);
});

test('multi-selection moves share a common correction and preserve relative spacing', () => {
  const beforeA = rectangle('a', 0, 0);
  const beforeB = rectangle('b', 70, 40);
  const movedA = rectangle('a', 13, 27);
  const movedB = rectangle('b', 83, 67);
  const output = snapChangedSceneElements([movedA, movedB], baselineFor(beforeA, beforeB), 20);
  assert.deepEqual(output.map((element) => [element.x, element.y]), [[20, 20], [90, 60]]);
  assert.deepEqual([output[1].x - output[0].x, output[1].y - output[0].y], [70, 40]);
});

test('new arrows snap world endpoints and keep their point structure', () => {
  const arrow = {
    id: 'arrow', type: 'arrow', x: 13, y: 27, width: 47, height: 31,
    points: [[0, 0], [47, 31]], angle: 0, version: 1, versionNonce: 1, updated: 1,
  };
  const output = snapChangedSceneElements([arrow], new Map(), 20)[0];
  const points = output.points.map(([x, y]) => [output.x + x, output.y + y]);
  assert.deepEqual(points, [[20, 20], [60, 60]]);
});

test('unchanged elements are not rewritten and the original array is returned', () => {
  const element = rectangle('steady', 20, 40);
  const input = [element];
  assert.equal(snapChangedSceneElements(input, baselineFor(element), 20), input);
});
