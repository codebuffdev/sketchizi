import test from "node:test";
import assert from "node:assert/strict";
import {
  CSS_PX_PER_INCH,
  CM_PER_INCH,
  PX_PER_CM,
  pxToCm,
  formatLengthCm,
  computeLinearElementLengthPx,
  computeElementBounds,
  getElementMeasurement,
} from "../src/features/canvas/elementMeasurement.js";

test("CSS 96 DPI conversion converts pixels to centimeters accurately", () => {
  assert.equal(CSS_PX_PER_INCH, 96);
  assert.equal(CM_PER_INCH, 2.54);
  assert.ok(Math.abs(pxToCm(PX_PER_CM) - 1) < 1e-9);
  assert.equal(formatLengthCm(pxToCm(326)), "8.63 cm");
  assert.equal(formatLengthCm(pxToCm(0)), "0.00 cm");
  assert.equal(formatLengthCm(pxToCm(-10)), "0.00 cm");
  assert.equal(formatLengthCm(pxToCm(Number.NaN)), "0.00 cm");
});

test("computeLinearElementLengthPx handles horizontal, diagonal, negative, and multi-point lines", () => {
  assert.equal(
    computeLinearElementLengthPx({
      type: "line",
      points: [[0, 0], [326, 0]],
    }),
    326
  );

  assert.equal(
    computeLinearElementLengthPx({
      type: "line",
      points: [[0, 0], [-300, -400]],
    }),
    500
  );

  assert.equal(
    computeLinearElementLengthPx({
      type: "line",
      points: [[0, 0], [100, 0], [100, 150]],
    }),
    250
  );

  assert.equal(
    computeLinearElementLengthPx({
      type: "line",
      width: 30,
      height: 40,
    }),
    50
  );
});

test("computeElementBounds centers beneath linear elements regardless of draw direction", () => {
  const rtlLine = computeElementBounds({
    type: "line",
    x: 500,
    y: 400,
    width: 300,
    height: 0,
    points: [[0, 0], [-300, 0]],
  });
  assert.equal(rtlLine.minX, 200);
  assert.equal(rtlLine.maxX, 500);
  assert.equal(rtlLine.bottomCenterX, 350);
  assert.equal(rtlLine.bottomY, 400);

  const bttLine = computeElementBounds({
    type: "line",
    x: 100,
    y: 300,
    width: 0,
    height: 200,
    points: [[0, 0], [0, -200]],
  });
  assert.equal(bttLine.bottomCenterX, 100);
  assert.equal(bttLine.bottomY, 300);

  const rect = computeElementBounds({
    type: "rectangle",
    x: 10,
    y: 20,
    width: 120,
    height: 80,
  });
  assert.equal(rect.bottomCenterX, 70);
  assert.equal(rect.bottomY, 100);
});

test("getElementMeasurement returns cm length for lines and arrows, font size for text, and px dimensions for shapes", () => {
  const line = getElementMeasurement({
    type: "line",
    x: 0,
    y: 0,
    width: 326,
    height: 0,
    points: [[0, 0], [326, 0]],
  });
  assert.equal(line.kind, "linear");
  assert.equal(line.label, "8.63 cm");
  assert.equal(line.lengthPx, 326);
  assert.equal(line.lengthCm, 8.63);
  assert.equal(line.title, "Line length: 8.63 cm (326 px)");

  const arrow = getElementMeasurement({
    type: "arrow",
    x: 0,
    y: 0,
    width: 300,
    height: 400,
    points: [[0, 0], [300, 400]],
  });
  assert.equal(arrow.kind, "linear");
  assert.equal(arrow.label, "13.23 cm");
  assert.equal(arrow.title, "Arrow length: 13.23 cm (500 px)");

  const text = getElementMeasurement({
    type: "text",
    fontSize: 20,
    width: 80,
    height: 25,
  });
  assert.equal(text.kind, "text");
  assert.equal(text.label, "20px");

  const rect = getElementMeasurement({
    type: "rectangle",
    width: 140,
    height: 90,
  });
  assert.equal(rect.kind, "dimensions");
  assert.equal(rect.label, "140 × 90 px");
});
