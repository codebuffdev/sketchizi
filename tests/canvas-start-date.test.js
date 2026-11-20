import test from "node:test";
import assert from "node:assert/strict";
import { formatCanvasStartDate, getLocalDateString, isValidCanvasStartDate } from "../src/features/canvas/canvasStartDate.js";

test("local date helper uses the local calendar date without UTC conversion", () => {
  const date = new Date(2026, 10, 20, 23, 45);
  assert.equal(getLocalDateString(date), "2026-11-20");
});

test("canvas start dates validate real calendar dates", () => {
  assert.equal(isValidCanvasStartDate("2026-11-20"), true);
  for (const value of ["2026-02-29", "2026-13-01", "2026-04-31", "20-11-2026", "", null]) {
    assert.equal(isValidCanvasStartDate(value), false);
  }
});

test("canvas start date formats as a concise localized label", () => {
  assert.equal(formatCanvasStartDate("2026-11-20", "en-GB"), "20 Nov 2026");
  assert.equal(formatCanvasStartDate("invalid"), "Set start date");
});
