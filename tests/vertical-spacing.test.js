import test from "node:test";
import assert from "node:assert/strict";
import { calculateVerticalSpacing, formatGapLabel } from "../src/features/canvas/verticalSpacing.js";

const t = (id, x, y, w = 100, h = 20, extra = {}) => ({ id, type: "text", x, y, width: w, height: h, ...extra });

test("detects the nearest element above with horizontal overlap", () => {
  const els = [t("a", 0, 0), t("b", 0, 50), t("far", 300, 90), t("c", 0, 100)];
  const r = calculateVerticalSpacing(els, "c", { snap: false });
  assert.equal(r.gap, 30); // b.bottom=70
  assert.equal(r.prev.top, 50);
  assert.equal(r.prevPrev.top, 0);
  assert.equal(r.referenceGap, 30);
});

test("ignores locked, deleted and non-overlapping candidates", () => {
  const els = [t("a", 0, 0, 100, 20, { locked: true }), t("d", 0, 30, 100, 20, { isDeleted: true }), t("e", 100, 40), t("c", 0, 100)];
  assert.equal(calculateVerticalSpacing(els, "c").prev, null); // e only touches at x=100 (strict overlap)
});

test("snaps to equal spacing within 6px and flags it", () => {
  const els = [t("a", 0, 0), t("b", 0, 40), t("c", 0, 86)]; // ref gap 20, gap 26 -> within 6
  const r = calculateVerticalSpacing(els, "c");
  assert.equal(r.isEqualSpacing, true);
  assert.equal(r.y, 80);
  assert.equal(r.gap, 20);
});

test("does not snap beyond threshold; threshold scales with zoom", () => {
  const els = [t("a", 0, 0), t("b", 0, 40), t("c", 0, 90)]; // gap 30 vs 20
  assert.equal(calculateVerticalSpacing(els, "c").isEqualSpacing, false);
  const els2 = [t("a", 0, 0), t("b", 0, 40), t("c", 0, 86)];
  assert.equal(calculateVerticalSpacing(els2, "c", { zoom: 2 }).isEqualSpacing, false); // 3px limit
});

test("snaps left edge and reports guide", () => {
  const els = [t("a", 10, 0), t("c", 14, 60)];
  const r = calculateVerticalSpacing(els, "c");
  assert.equal(r.x, 10);
  assert.equal(r.leftGuide.x, 10);
  assert.equal(calculateVerticalSpacing([t("a", 10, 0), t("c", 30, 60)], "c").leftGuide, null);
});

test("guideX is midpoint of horizontal overlap; label format", () => {
  const r = calculateVerticalSpacing([t("a", 0, 0, 100), t("c", 40, 60, 100)], "c", { snap: false });
  assert.equal(r.guideX, 70);
  assert.equal(formatGapLabel(19.6), "20");
  assert.equal(formatGapLabel(42), "42px");
});
