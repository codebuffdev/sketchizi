import { test, expect } from "../fixtures/responsive.fixture.js";
import { SEL, SCENE, drawFixtureScene, selectRectA, rectAOutline, isTouch, canvasBox, pt, settle } from "../helpers/suite-kit.js";
import { drawShape, drawText, mouseDrag, pickTool, marquee, shiftClick, zoom, pan, waitForElements, touchDrag, touchTap, touchPinch, readScene } from "../helpers/canvas.js";

test.describe("B · Infinite canvas", () => {
  test.beforeEach(async ({ qa }) => { await qa.boot(); });

  test("initial canvas renders and fills the viewport", async ({ qa, page }) => {
    const box = await canvasBox(page);
    expect(box.width).toBeGreaterThan(qa.viewport.width * 0.6);
    expect(box.height).toBeGreaterThan(qa.viewport.height * 0.5);
    await qa.checkpoint("initial");
  });

  test("draw rectangle, arrow and text with pointer input", async ({ qa, page }) => {
    const { elements } = await drawFixtureScene(qa);
    expect(elements.filter((e) => e.type === "rectangle").length, "rectangles persisted").toBeGreaterThanOrEqual(2);
    expect.soft(elements.some((e) => e.type === "arrow"), "arrow persisted").toBe(true);
    expect.soft(elements.some((e) => e.type === "text"), "text persisted").toBe(true);
    await qa.checkpoint("drawn-scene");
  });

  test("single selection exposes contextual controls", async ({ qa, page }) => {
    await drawFixtureScene(qa);
    await selectRectA(qa);
    await expect(page.getByText("Selected shape actions", { exact: true }).first()).toBeVisible({ timeout: 8000 });
    await qa.checkpoint("single-selected");
  });

  test("multi-selection via marquee and Shift+click", async ({ qa, page }) => {
    const { box, P } = await drawFixtureScene(qa);
    await marquee(page, pt(box, 0.28, 0.28), pt(box, 0.82, 0.52));
    await qa.checkpoint("marquee-selected");
    await pickTool(page, "v");
    await page.keyboard.press("Escape");
    await page.mouse.click(...Object.values(rectAOutline(box)));
    await shiftClick(page, { x: Math.round(box.x + box.width * 0.67), y: Math.round(box.y + box.height * SCENE.rectB.from[1]) });
    await qa.checkpoint("shift-multi-selected");
  });

  test("move a selected shape by dragging its outline", async ({ qa, page }) => {
    const { box, elements } = await drawFixtureScene(qa);
    const before = elements.filter((e) => e.type === "rectangle")[0];
    await pickTool(page, "v");
    const from = rectAOutline(box);
    await mouseDrag(page, from, { x: from.x + 24, y: from.y + 56 }, { steps: 12 });
    const moved = await waitForElements(page, (els) => els.some((e) => e.id === before.id && (Math.abs(e.x - before.x) > 8 || Math.abs(e.y - before.y) > 8)), { timeout: 8000 });
    expect.soft(moved, "rectangle did not move after drag").not.toBeNull();
    await qa.checkpoint("moved");
  });

  test("resize a selected shape via its corner handle", async ({ qa, page }) => {
    const { box, elements } = await drawFixtureScene(qa);
    const target = elements.filter((e) => e.type === "rectangle")[0];
    await selectRectA(qa);
    const x2 = Math.round(box.x + box.width * SCENE.rectA.to[0]);
    const y2 = Math.round(box.y + box.height * SCENE.rectA.to[1]);
    await mouseDrag(page, { x: x2 + 6, y: y2 + 6 }, { x: x2 + 46, y: y2 + 36 }, { steps: 10 });
    const resized = await waitForElements(page, (els) => els.some((e) => e.id === target.id && (e.width > target.width + 10 || e.height > target.height + 10)), { timeout: 8000 });
    expect.soft(resized, "rectangle was not resized by handle drag (handle hit-area may be too small at this viewport)").not.toBeNull();
    await qa.checkpoint("resized");
  });

  test("edit existing text", async ({ qa, page }) => {
    const { box } = await drawFixtureScene(qa);
    const at = pt(box, SCENE.text[0] + 0.04, SCENE.text[1] + 0.012);
    await pickTool(page, "v");
    await page.mouse.dblclick(at.x, at.y);
    await page.keyboard.type(" edited", { delay: 5 });
    await qa.checkpoint("text-editing", { checks: ["overflow", "clipping", "overlap"] });
    await page.keyboard.press("Escape");
    const els = await waitForElements(page, (list) => list.some((e) => e.type === "text" && /edited/.test(e.text || "")), { timeout: 8000 });
    expect.soft(els, "edited text was not persisted").not.toBeNull();
  });

  test("zoom in/out with ctrl+wheel and pan with the hand tool", async ({ qa, page }) => {
    await drawFixtureScene(qa);
    const box = await canvasBox(page);
    await zoom(page, "in", box);
    await qa.checkpoint("zoomed-in");
    await zoom(page, "out", box);
    await zoom(page, "out", box);
    await qa.checkpoint("zoomed-out");
    await pan(page, pt(box, 0.6, 0.8), pt(box, 0.4, 0.7));
    await qa.checkpoint("panned");
  });

  test("touch: tap-select, drag-draw and pinch zoom", async ({ qa, page }) => {
    test.skip(!isTouch(qa), "touch-only interaction");
    const box = await canvasBox(page);
    await pickTool(page, "r");
    await touchDrag(page, pt(box, 0.36, 0.36), pt(box, 0.62, 0.5));
    const drawn = await waitForElements(page, (els) => els.some((e) => e.type === "rectangle"), { timeout: 10_000 });
    expect.soft(drawn, "touch drag did not create a rectangle").not.toBeNull();
    await pickTool(page, "v");
    await touchTap(page, { x: Math.round(box.x + box.width * 0.49), y: Math.round(box.y + box.height * 0.36) });
    await qa.checkpoint("touch-selected");
    await touchPinch(page, pt(box, 0.5, 0.5));
    await qa.checkpoint("touch-pinched");
  });

  test("selection near viewport edges keeps controls on-screen", async ({ qa, page }) => {
    const box = await canvasBox(page);
    await drawShape(page, "rectangle", pt(box, 0.80, 0.30), pt(box, 0.97, 0.42));
    await pickTool(page, "v");
    await page.mouse.click(...Object.values({ x: Math.round(box.x + box.width * 0.885), y: Math.round(box.y + box.height * 0.30) }));
    await settle(page);
    await qa.checkpoint("edge-selection-right");
    await drawShape(page, "rectangle", pt(box, 0.30, 0.86), pt(box, 0.46, 0.95));
    await pickTool(page, "v");
    await page.mouse.click(...Object.values({ x: Math.round(box.x + box.width * 0.38), y: Math.round(box.y + box.height * 0.86) }));
    await qa.checkpoint("edge-selection-bottom");
  });
});
