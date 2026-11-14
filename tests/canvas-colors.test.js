import test from "node:test";
import assert from "node:assert/strict";
import { canvasColorForDisplay, canvasColorForScene, normalizeCanvasHex } from "../src/features/navigation/canvasColors.js";

test("light canvas colors preserve the selected RGB", () => {
  assert.equal(canvasColorForScene("#ABCDEF", false), "#abcdef");
  assert.equal(canvasColorForDisplay("#abcdef", false), "#abcdef");
});

test("dark canvas default matches the actual Excalidraw filter", () => {
  assert.equal(canvasColorForDisplay("#f3faff", true), "#12181c");
});

test("custom dark colors round trip through the canvas filter within rounding", () => {
  for (const color of ["#363636", "#566c7a", "#8a7660", "#b0b0b0"]) {
    const result = canvasColorForDisplay(canvasColorForScene(color, true), true);
    for (const offset of [1, 3, 5]) assert.ok(Math.abs(parseInt(color.slice(offset, offset + 2), 16) - parseInt(result.slice(offset, offset + 2), 16)) <= 1);
  }
});

test("out of gamut and invalid colors produce valid RGB values", () => {
  for (const color of ["#000000", "#ffffff", "#ff0000", null, "garbage"]) {
    assert.match(canvasColorForScene(color, true), /^#[\da-f]{6}$/);
  }
});

test("hex entry accepts full, short, and pasted colors", () => {
  assert.equal(normalizeCanvasHex(" #AbC123 "), "#abc123");
  assert.equal(normalizeCanvasHex("12181C"), "#12181c");
  assert.equal(normalizeCanvasHex("#abc"), "#aabbcc");
  assert.equal(normalizeCanvasHex("ABC"), "#aabbcc");
});
test("hex entry rejects incomplete and malformed colors", () => {
  for (const value of ["", "#", "#12", "#1234", "#1234567", "#GGGGGG", "##12181c", null]) assert.equal(normalizeCanvasHex(value), null);
});
