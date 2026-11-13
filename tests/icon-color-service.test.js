import test from "node:test";
import assert from "node:assert/strict";
import {
  CORE_ICON_COLORS,
  isLightColor,
  isRecolorableEssentialIcon,
  recolorSvgDataUrl,
  recolorSvgMarkup,
} from "../src/features/icon-library/iconColorService.js";

test("recolorSvgMarkup sets root fill for fill-default Simple Icons without breaking geometry", () => {
  const simpleIcon = '<svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L2 22h20L12 2z"/></svg>';
  const recolored = recolorSvgMarkup(simpleIcon, "#3b82f6");
  assert.ok(recolored);
  assert.match(recolored, /<svg[^>]*fill="#3b82f6"/);
  assert.doesNotMatch(recolored, /<path[^>]*fill=/);
});

test("recolorSvgMarkup preserves fill='none' on outlined Lucide icons and recolors stroke", () => {
  const lucideIcon = '<svg class="lucide" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="m14 12 4 4 4-4" /><path d="M18 16V7" /></svg>';
  const recolored = recolorSvgMarkup(lucideIcon, "#ef4444");
  assert.ok(recolored);
  assert.match(recolored, /fill="none"/);
  assert.match(recolored, /stroke="#ef4444"/);
  assert.doesNotMatch(recolored, /<path[^>]*fill="#ef4444"/);
});

test("recolorSvgDataUrl encodes recolored base64 SVG data URLs safely", () => {
  const svg = '<svg viewBox="0 0 24 24" fill="none" stroke="#111111"><circle cx="12" cy="12" r="8"/></svg>';
  const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  const updated = recolorSvgDataUrl(dataUrl, "#7c3aed");
  assert.ok(updated?.startsWith("data:image/svg+xml;base64,"));
  const decoded = Buffer.from(updated.split(",")[1], "base64").toString("utf8");
  assert.match(decoded, /stroke="#7c3aed"/);
  assert.match(decoded, /fill="none"/);
});

test("isRecolorableEssentialIcon targets Core/Essentials icons and excludes cloud catalogs", () => {
  assert.equal(isRecolorableEssentialIcon({
    type: "image",
    customData: { diagramIcon: true, iconId: "docker", iconSource: "eraser", iconCategory: "Eraser Icons" },
  }), true);
  assert.equal(isRecolorableEssentialIcon({
    type: "image",
    customData: { diagramIcon: true, iconId: "alarm-clock", iconCategory: "Essentials" },
  }), true);
  assert.equal(isRecolorableEssentialIcon({
    type: "image",
    customData: { diagramIcon: true, iconId: "aws:lambda", iconSource: "aws", iconCategory: "Compute" },
  }), false);
  assert.equal(isRecolorableEssentialIcon({ type: "rectangle", customData: {} }), false);
});

test("CORE_ICON_COLORS and isLightColor classify white/light vs dark swatches accurately", () => {
  assert.ok(CORE_ICON_COLORS.length >= 6);
  assert.equal(isLightColor("#ffffff"), true);
  assert.equal(isLightColor("#fff"), true);
  assert.equal(isLightColor("#1e293b"), false);
  assert.equal(isLightColor("#7c3aed"), false);
});
