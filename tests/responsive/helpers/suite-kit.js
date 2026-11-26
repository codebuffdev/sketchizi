import { SEL } from "../config/selectors.js";
import { viewportClassFor, isTouchViewport } from "../config/viewports.js";
import { canvasBox, pt, drawShape, drawText, mouseDrag, pickTool, waitForElements } from "./canvas.js";
import { openSurface, closeSurface, isVisible, openCommand } from "./navigation.js";
import { settle } from "./viewport.js";

export const vpClass = (qa) => viewportClassFor(qa.viewport.width);
export const isTouch = (qa) => isTouchViewport(qa.viewport);
export const isPhone = (qa) => vpClass(qa) === "phone";

/** Fractions of the canvas used by the shared fixture scene (kept clear of docks/headers). */
export const SCENE = {
  rectA: { from: [0.34, 0.34], to: [0.52, 0.46] },
  rectB: { from: [0.58, 0.34], to: [0.76, 0.46] },
  arrow: { from: [0.40, 0.58], to: [0.70, 0.58] },
  text: [0.42, 0.70],
};

/**
 * Draws two rectangles, an arrow and a text label through real canvas
 * interactions and waits until the autosave contains them.
 */
export async function drawFixtureScene(qa) {
  const page = qa.page;
  const box = await canvasBox(page);
  const P = (f) => pt(box, f[0], f[1]);
  await drawShape(page, "rectangle", P(SCENE.rectA.from), P(SCENE.rectA.to));
  await drawShape(page, "rectangle", P(SCENE.rectB.from), P(SCENE.rectB.to));
  await drawShape(page, "arrow", P(SCENE.arrow.from), P(SCENE.arrow.to));
  await drawText(page, P(SCENE.text), "Responsive QA");
  await pickTool(page, "v");
  const live = await waitForElements(page, (els) => els.filter((e) => e.type === "rectangle").length >= 2, { timeout: 12_000 });
  return { box, P, elements: live || [] };
}

/** Click the top edge of rect A (unfilled rectangles select by outline). */
export function rectAOutline(box) {
  const x = Math.round(box.x + box.width * ((SCENE.rectA.from[0] + SCENE.rectA.to[0]) / 2));
  const y = Math.round(box.y + box.height * SCENE.rectA.from[1]);
  return { x, y };
}

export async function selectRectA(qa) {
  const box = await canvasBox(qa.page);
  await pickTool(qa.page, "v");
  await qa.page.mouse.click(...Object.values(rectAOutline(box)));
  await settle(qa.page, { frames: 2 });
  return box;
}

/** Opens a surface or records a coverage gap. Returns true when open. */
export async function openOrGap(qa, feature, opts, reason) {
  const ok = await openSurface(qa.page, opts);
  if (!ok) qa.gap(feature, reason || `could not be opened at ${qa.viewport.id} (tried ${[...(opts.controls || []), opts.command].filter(Boolean).join(" | ")})`);
  return ok;
}

export async function openStudio(qa, command, selector, feature) {
  await openCommand(qa.page, command).catch(() => {});
  const ok = await isVisible(qa.page, selector, 8000);
  if (!ok) qa.gap(feature, `command "${command}" did not show ${selector} at ${qa.viewport.id}`);
  return ok;
}

export { SEL, canvasBox, pt, isVisible, closeSurface, openCommand, settle };
