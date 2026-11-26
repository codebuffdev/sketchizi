import { test, expect } from "../fixtures/responsive.fixture.js";
import { SEL, drawFixtureScene, openCommand, isVisible, settle, canvasBox, pt } from "../helpers/suite-kit.js";
import { rotate } from "../helpers/viewport.js";

async function showMinimap(qa) {
  const page = qa.page;
  if (await isVisible(page, SEL.minimap)) return true;
  await openCommand(page, "Toggle Minimap").catch(() => {});
  const ok = await isVisible(page, SEL.minimap, 4000);
  if (!ok) qa.gap("Minimap", `could not be shown at ${qa.viewport.id} via "Toggle Minimap"`);
  return ok;
}

test.describe("H · Minimap and zoom controls", () => {
  test.beforeEach(async ({ qa }) => { await qa.boot(); await drawFixtureScene(qa); });

  test("toggle minimap open and closed", async ({ qa, page }) => {
    if (!(await showMinimap(qa))) return;
    await qa.checkpoint("minimap-open", { checks: ["overflow", "clipping", "overlap", "touch", "layout"] });
    await openCommand(page, "Toggle Minimap").catch(() => {});
    await expect(page.locator(SEL.minimap).first()).toBeHidden({ timeout: 5000 });
    await qa.checkpoint("minimap-closed", { checks: ["overflow", "overlap"] });
  });

  test("zoom controls respond and do not overlap the dock or minimap", async ({ qa, page }) => {
    const control = page.locator(SEL.zoomControl).first();
    if (!(await control.isVisible().catch(() => false))) {
      qa.gap("Zoom controls", "not visible in the default shell (may be collapsed behind the header on this viewport)");
    } else {
      const label = page.locator(`${SEL.zoomControl} button`).first();
      await label.click().catch(() => {});
      await settle(page);
      await qa.checkpoint("zoom-control-open", { checks: ["overflow", "clipping", "overlap", "touch"] });
      await page.keyboard.press("Escape");
    }
    await showMinimap(qa);
    await qa.checkpoint("zoom-and-minimap", { checks: ["overflow", "clipping", "overlap"] });
  });

  test("zoom in/out changes the minimap viewport; clicking the minimap navigates", async ({ qa, page }) => {
    if (!(await showMinimap(qa))) return;
    const box = await canvasBox(page);
    await zoom(page, "in", box);
    await zoom(page, "in", box);
    await qa.checkpoint("minimap-zoomed-in", { checks: ["overflow", "clipping", "overlap"] });
    const mm = await page.locator(SEL.minimap).first().boundingBox();
    expect(mm, "minimap has no box").not.toBeNull();
    await page.mouse.click(mm.x + mm.width * 0.2, mm.y + mm.height * 0.25);
    await settle(page);
    await qa.checkpoint("minimap-navigated", { checks: ["overflow", "clipping", "overlap"] });
    await zoom(page, "out", box);
  });

  test("mobile visibility and landscape behaviour", async ({ qa, page }) => {
    if (!(await showMinimap(qa))) return;
    await qa.checkpoint("minimap-portrait", { checks: ["overflow", "clipping", "overlap", "layout"] });
    await rotate(page);
    const stillVisible = await isVisible(page, SEL.minimap);
    if (!stillVisible) qa.record({ category: "layout", severity: "P3", message: "Minimap hides after orientation change (verify this is intentional)", selector: SEL.minimap }, "minimap-landscape");
    await qa.checkpoint("minimap-landscape", { checks: ["overflow", "clipping", "overlap"] });
  });
});
