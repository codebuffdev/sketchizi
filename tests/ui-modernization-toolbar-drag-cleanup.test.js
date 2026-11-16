import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');

test('active drag listeners have a single cleanup path', () => {
  assert.match(canvas, /let activeDragCleanup = null/);
  assert.match(canvas, /activeDragCleanup = finish/);
  assert.match(canvas, /window\.removeEventListener\("pointermove", move\)/);
  assert.match(canvas, /window\.removeEventListener\("pointerup", finish\)/);
  assert.match(canvas, /window\.removeEventListener\("pointercancel", finish\)/);
});

test('canvas effect cleanup ends an in-progress drag before disconnecting observers', () => {
  assert.match(canvas, /disposed = true;\s*activeDragCleanup\?\.\(\);\s*cancelAnimationFrame\(frame\)/);
});

test('drag cleanup is safe when pointerup or pointercancel fires more than once', () => {
  assert.match(canvas, /if \(activeDragCleanup === finish\) activeDragCleanup = null/);
  assert.match(canvas, /window\.addEventListener\("pointerup", finish, \{ once: true \}\)/);
  assert.match(canvas, /window\.addEventListener\("pointercancel", finish, \{ once: true \}\)/);
});
