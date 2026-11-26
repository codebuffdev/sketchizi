import { test, expect } from "@playwright/test";

/**
 * Primary Dock: child rail, tooltips, collapse timing, scrollbars and the real
 * Excalidraw element each tool produces (read back from IndexedDB:
 * db "sketchizi-local-state", store "documents", record "canvas-tabs-manifest").
 *
 * Runs twice: with a mouse and with hasTouch (tap-driven dock interaction).
 */

const DOCK = ".sketchizi-tool-sidebar";
const PILL = `${DOCK} .sketchizi-tool-sidebar-active`;
const RAIL = `${DOCK} .sketchizi-tool-sidebar-child-rail`;

async function openCanvas(page) {
  await page.goto("/");
  const chooser = page.locator(".startup-canvas-option").first();
  if (await chooser.isVisible({ timeout: 4000 }).catch(() => false)) await chooser.click();
  await expect(page.locator(".excalidraw").first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(DOCK)).toBeVisible();
}

/** Mouse: hover the pill. Touch: tap it. */
async function expandDock(page, touch) {
  if (await page.locator(DOCK + ".is-expanded").count()) return;
  if (touch) await page.locator(PILL).tap(); else await page.locator(PILL).hover();
  await expect(page.locator(DOCK)).toHaveClass(/is-expanded/);
}

const slot = (page, id) => page.locator(`${DOCK} .sketchizi-tool-sidebar-button[data-slot="${id}"]`);

/** Open a grouped slot's child rail the way the input mode does. */
async function openRail(page, touch, slotId) {
  await expandDock(page, touch);
  if (touch) await slot(page, slotId).tap(); else await slot(page, slotId).hover();
  await expect(page.locator(RAIL)).toBeVisible();
}

async function pickChild(page, touch, slotId, childId) {
  await openRail(page, touch, slotId);
  const child = page.locator(`${RAIL} [data-tool="${childId}"]`);
  if (touch) await child.tap(); else await child.click();
}

async function dragOnCanvas(page, from = [520, 300], to = [680, 420]) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, { steps: 6 });
  await page.mouse.move(to[0], to[1], { steps: 6 });
  await page.mouse.up();
}

/** Every element-like object found anywhere in the persisted manifest. */
async function persistedElements(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("sketchizi-local-state");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const req = db.transaction("documents", "readonly").objectStore("documents").get("canvas-tabs-manifest");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const found = [];
        const seen = new Set();
        const walk = (value) => {
          if (!value || typeof value !== "object" || seen.has(value)) return;
          seen.add(value);
          if (!Array.isArray(value) && typeof value.type === "string" && typeof value.id === "string" && "x" in value && !value.isDeleted) found.push(value);
          for (const child of Array.isArray(value) ? value : Object.values(value)) walk(child);
        };
        walk(req.result);
        db.close();
        resolve(found);
      };
    };
  }));
}

async function waitForElements(page, predicate, message) {
  await expect.poll(async () => (await persistedElements(page)).filter(predicate).length, { message, timeout: 15_000 }).toBeGreaterThan(0);
  return (await persistedElements(page)).filter(predicate);
}

for (const mode of ["mouse", "touch"]) {
  const touch = mode === "touch";
  test.describe(`primary dock (${mode})`, () => {
    test.use({ hasTouch: touch });
    test.beforeEach(async ({ page }) => { await openCanvas(page); });

    test("child rail opens, a child becomes the active tool, the parent icon follows, parent tooltip is suppressed", async ({ page }) => {
      await openRail(page, touch, "shapes");
      await expect(page.locator(`${DOCK} .sketchizi-tool-sidebar-tooltip`)).toHaveCount(0);
      if (touch) {
        // Touch must not close on the synthetic pointerleave: still open after 600ms.
        await page.waitForTimeout(600);
        await expect(page.locator(RAIL)).toBeVisible();
      }
      const rail = await page.locator(RAIL).boundingBox();
      const dock = await page.locator(DOCK).boundingBox();
      expect(rail.width).toBeCloseTo(44, 0);
      expect(rail.x).toBeGreaterThanOrEqual(dock.x + dock.width - 1);

      const child = page.locator(`${RAIL} [data-tool="ellipse"]`);
      if (touch) await child.tap(); else await child.click();
      await expect(page.locator(PILL)).toHaveAttribute("aria-label", /Ellipse/);
      await expandDock(page, touch);
      await expect(slot(page, "shapes")).toHaveAttribute("aria-label", /Shapes: Ellipse/);
    });

    test("child rail closes on Escape and returns focus to its slot", async ({ page }) => {
      await expandDock(page, touch);
      await slot(page, "connectors").focus();
      await page.keyboard.press("Enter");
      await expect(page.locator(RAIL)).toBeVisible();
      await expect(page.locator(`${RAIL} button`).first()).toBeFocused();
      await page.keyboard.press("ArrowDown");
      await expect(page.locator(`${RAIL} button`).nth(1)).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(page.locator(RAIL)).toHaveCount(0);
      await expect(slot(page, "connectors")).toBeFocused();
    });

    test("child rail closes on an outside tap/click", async ({ page }) => {
      await openRail(page, touch, "shapes");
      if (touch) await page.locator(".excalidraw canvas").first().tap({ position: { x: 600, y: 200 } });
      else { await page.mouse.move(900, 300); await page.waitForTimeout(400); }
      await expect(page.locator(RAIL)).toHaveCount(0);
    });

    test("dock, rail and bridge never produce horizontal scroll", async ({ page }) => {
      for (const slotId of ["shapes", "connectors", "freehand"]) {
        await openRail(page, touch, slotId);
        const result = await page.evaluate(() => {
          const overflowing = (el) => el && el.scrollWidth > el.clientWidth + 1;
          return {
            dock: overflowing(document.querySelector(".sketchizi-tool-sidebar")),
            list: overflowing(document.querySelector(".sketchizi-tool-sidebar-list")),
            rail: overflowing(document.querySelector(".sketchizi-tool-sidebar-child-rail")),
            bridge: overflowing(document.querySelector(".sketchizi-tool-sidebar-hover-bridge")),
          };
        });
        expect(result).toEqual({ dock: false, list: false, rail: false, bridge: false });
      }
    });

    test("single slots show a parent tooltip after ~180ms (mouse only)", async ({ page }) => {
      test.skip(touch, "hover tooltips are mouse-only");
      await expandDock(page, touch);
      await slot(page, "hand").hover();
      await expect(page.locator(`${DOCK} .sketchizi-tool-sidebar-tooltip`)).toHaveText(/Pan Canvas \(H\)/);
      await slot(page, "shapes").hover();
      await expect(page.locator(`${DOCK} .sketchizi-tool-sidebar-tooltip`)).toHaveCount(0);
    });

    test("collapses 3s after the pointer leaves and re-entry cancels it (mouse only)", async ({ page }) => {
      test.skip(touch, "timed hover collapse is mouse-only");
      await expandDock(page, touch);
      await page.mouse.move(900, 300);
      await page.waitForTimeout(2000);
      await expect(page.locator(DOCK)).toHaveClass(/is-expanded/);
      await slot(page, "hand").hover(); // re-enter cancels the pending collapse
      await page.waitForTimeout(2000);
      await expect(page.locator(DOCK)).toHaveClass(/is-expanded/);
      await page.mouse.move(900, 300);
      await page.waitForTimeout(2600);
      await expect(page.locator(DOCK)).toHaveClass(/is-expanded/);
      await expect(page.locator(DOCK)).not.toHaveClass(/is-expanded/, { timeout: 1500 });
    });

    test("chevron cap and backslash collapse immediately", async ({ page }) => {
      await expandDock(page, touch);
      const cap = page.locator(`${DOCK} .sketchizi-tool-sidebar-expand`);
      if (touch) await cap.tap(); else await cap.click();
      await expect(page.locator(DOCK)).not.toHaveClass(/is-expanded/);
      await page.locator(".excalidraw canvas").first().focus().catch(() => {});
      await page.keyboard.press("\\");
      await expect(page.locator(DOCK)).toHaveClass(/is-expanded/);
      await page.keyboard.press("\\");
      await expect(page.locator(DOCK)).not.toHaveClass(/is-expanded/);
    });

    // [slot, child, predicate over persisted elements, description]
    const DRAWN = [
      ["shapes", "rectangle", (e) => e.type === "rectangle" && !e.roundness, "sharp rectangle"],
      ["shapes", "rounded-rectangle", (e) => e.type === "rectangle" && e.roundness?.type === 3, "rounded rectangle"],
      ["shapes", "ellipse", (e) => e.type === "ellipse", "ellipse"],
      ["shapes", "diamond", (e) => e.type === "diamond", "diamond"],
      ["connectors", "arrow", (e) => e.type === "arrow" && !e.startArrowhead && e.endArrowhead === "arrow" && !e.elbowed, "arrow"],
      ["connectors", "double-arrow", (e) => e.type === "arrow" && e.startArrowhead === "arrow" && e.endArrowhead === "arrow", "double arrow"],
      ["connectors", "curved-arrow", (e) => e.type === "arrow" && !e.elbowed && Boolean(e.roundness), "curved arrow"],
      ["connectors", "elbow-arrow", (e) => e.type === "arrow" && e.elbowed === true, "elbow arrow"],
      ["connectors", "dashed-arrow", (e) => e.type === "arrow" && e.strokeStyle === "dashed", "dashed arrow"],
      ["connectors", "line", (e) => e.type === "line", "line"],
      ["freehand", "pen", (e) => e.type === "freedraw" && e.opacity === 100, "pen stroke"],
      ["freehand", "highlighter", (e) => e.type === "freedraw" && e.opacity === 38, "highlighter stroke (opacity 38)"],
    ];
    for (const [slotId, childId, predicate, label] of DRAWN) {
      test(`draws a real ${label}`, async ({ page }) => {
        await pickChild(page, touch, slotId, childId);
        await dragOnCanvas(page);
        await waitForElements(page, predicate, `persisted ${label}`);
      });
    }

    for (const [childId, label] of [["triangle", "triangle"], ["hexagon", "hexagon"], ["funnel", "funnel"]]) {
      test(`inserts a persisted closed line for ${label}`, async ({ page }) => {
        await pickChild(page, touch, "shapes", childId);
        const [line] = await waitForElements(page, (e) => e.type === "line", `persisted ${label}`);
        const first = line.points[0]; const last = line.points.at(-1);
        expect(last).toEqual(first);
      });
    }

    test("inserts a cylinder as a grouped ellipse + line", async ({ page }) => {
      await pickChild(page, touch, "shapes", "cylinder");
      await waitForElements(page, (e) => e.type === "ellipse", "persisted cylinder cap");
      const els = await persistedElements(page);
      const cap = els.find((e) => e.type === "ellipse");
      const body = els.find((e) => e.type === "line");
      expect(cap.groupIds.length).toBeGreaterThan(0);
      expect(body.groupIds).toEqual(cap.groupIds);
    });

    test("inserts a sticky note flagged as a note", async ({ page }) => {
      await pickChild(page, touch, "text", "sticky-note");
      await waitForElements(page, (e) => e.type === "rectangle" && e.customData?.isNote === true, "persisted sticky note");
    });

    test("lasso, laser and embed activate their real Excalidraw tools", async ({ page }) => {
      for (const [slotId, childId, label] of [["selection", "lasso", /Lasso/], ["eraser", "laser", /Laser/], ["magic", "embed", /Embed/]]) {
        await pickChild(page, touch, slotId, childId);
        await expect(page.locator(PILL)).toHaveAttribute("aria-label", label);
      }
    });

    test("Magic Assist opens the AI panel", async ({ page }) => {
      await pickChild(page, touch, "magic", "ai-assist");
      await expect(page.locator(".ai-ask-panel")).toBeVisible();
    });

    test("Library & Templates opens the icon library panel", async ({ page }) => {
      await expandDock(page, touch);
      if (touch) await slot(page, "library").tap(); else await slot(page, "library").click();
      await expect(page.locator(".library-panel")).toBeVisible();
    });
  });
}
