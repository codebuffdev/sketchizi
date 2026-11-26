import { test, expect } from "../fixtures/responsive.fixture.js";
import { SEL, drawFixtureScene, selectRectA, isVisible, settle } from "../helpers/suite-kit.js";
import { canvasBox, pt, marquee, drawShape, pickTool } from "../helpers/canvas.js";

async function dockVisible(page) {
  return (await isVisible(page, SEL.toolOptionsDock)) || (await isVisible(page, SEL.contextualToolbar));
}

test.describe("D · Contextual formatting dock", () => {
  test.beforeEach(async ({ qa }) => { await qa.boot(); });

  test("single-object selection shows the dock inside the viewport", async ({ qa, page }) => {
    await drawFixtureScene(qa);
    await selectRectA(qa);
    if (!(await dockVisible(page))) return qa.gap("Contextual dock", "no formatting dock after selecting a shape");
    const dock = page.locator(`${SEL.toolOptionsDock}, ${SEL.contextualToolbar}`).first();
    const b = await dock.boundingBox();
    expect.soft(b.x, "dock left edge off-screen").toBeGreaterThanOrEqual(-1);
    expect.soft(b.x + b.width, "dock right edge off-screen").toBeLessThanOrEqual(qa.viewport.width + 1);
    expect.soft(b.y + b.height, "dock bottom edge off-screen").toBeLessThanOrEqual(qa.viewport.height + 1);
    await qa.checkpoint("single-selection-dock");
  });

  test("multi-object selection", async ({ qa, page }) => {
    const { box } = await drawFixtureScene(qa);
    await marquee(page, pt(box, 0.28, 0.28), pt(box, 0.82, 0.52));
    if (!(await dockVisible(page))) return qa.gap("Contextual dock", "no dock after multi-select");
    await qa.checkpoint("multi-selection-dock");
  });

  test("text formatting controls", async ({ qa, page }) => {
    const { box } = await drawFixtureScene(qa);
    await pickTool(page, "v");
    await page.mouse.click(...Object.values(pt(box, 0.46, 0.712)));
    await settle(page);
    if (!(await dockVisible(page))) return qa.gap("Contextual dock", "no dock after selecting text");
    await qa.checkpoint("text-selection-dock");
  });

  test("popovers (choice / align / arrange / colour) stay on-screen", async ({ qa, page }) => {
    await drawFixtureScene(qa);
    await selectRectA(qa);
    if (!(await dockVisible(page))) return qa.gap("Contextual dock", "dock unavailable");
    const triggers = [SEL.toolChoiceTrigger, SEL.alignTrigger, SEL.layerTrigger, SEL.colorControl, SEL.formattingOptionsButton];
    let opened = 0;
    for (const sel of triggers) {
      const t = page.locator(sel).first();
      if (!(await t.isVisible().catch(() => false))) continue;
      await t.click({ timeout: 3000 }).catch(() => {});
      await settle(page);
      if (await isVisible(page, SEL.contextualPopovers)) {
        opened += 1;
        const label = sel.replace(/[^a-z]+/gi, "-").slice(0, 30);
        await qa.checkpoint(`popover-${label}`);
      }
      await page.keyboard.press("Escape");
      await settle(page, { frames: 1 });
      await selectRectA(qa);
    }
    if (!opened) qa.gap("Contextual dock popovers", "no popover could be opened from the dock at this viewport");
  });

  test("dock collides neither with viewport edges nor tabs when selection is at the edge", async ({ qa, page }) => {
    const box = await canvasBox(page);
    await drawShape(page, "rectangle", pt(box, 0.80, 0.78), pt(box, 0.97, 0.92));
    await pickTool(page, "v");
    await page.mouse.click(...Object.values(pt(box, 0.885, 0.78)));
    await settle(page);
    if (!(await dockVisible(page))) return qa.gap("Contextual dock", "dock unavailable for edge selection");
    await qa.checkpoint("edge-collision", { checks: ["overflow", "clipping", "overlap"] });
  });
});
