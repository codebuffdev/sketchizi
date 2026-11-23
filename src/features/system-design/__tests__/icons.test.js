import test from "node:test";
import assert from "node:assert/strict";
import { ICON_SHAPES, ICON_TAGS, hasIconShape } from "../primitiveIconShapes.js";
import { PRIMITIVES, QUICK_KINDS, morePrimitivesByCategory, quickPrimitives } from "../primitives.js";

test("every one of the 22 primitives maps to a real inline SVG icon", () => {
  assert.equal(PRIMITIVES.length, 22);
  for (const p of PRIMITIVES) {
    assert.ok(p.icon, `${p.kind} has no icon`);
    assert.ok(hasIconShape(p.icon), `${p.kind} -> missing shape "${p.icon}"`);
    assert.ok(p.shortLabel, `${p.kind} short label`);
  }
  assert.equal(new Set(PRIMITIVES.map((p) => p.icon)).size, 22, "each primitive is visually distinct");
});

test("icon shapes only use allowed tags, numeric/finite geometry and no hard-coded colours", () => {
  for (const [name, shapes] of Object.entries(ICON_SHAPES)) {
    assert.ok(shapes.length > 0, name);
    for (const [tag, attrs] of shapes) {
      assert.ok(ICON_TAGS.includes(tag), `${name}: tag ${tag}`);
      assert.ok(!("fill" in attrs) && !("stroke" in attrs), `${name} must inherit currentColor`);
      for (const [key, value] of Object.entries(attrs)) {
        if (typeof value === "number") assert.ok(Number.isFinite(value), `${name}.${key}`);
        if (["cx", "cy", "x", "y", "r", "rx", "ry", "width", "height"].includes(key)) assert.ok(value >= 0 && value <= 24, `${name}.${key} within 24x24 grid`);
      }
    }
  }
});

test("the catalog exposes all 22 primitives through role-based category groups; the six-item quick set remains unique", () => {
  assert.deepEqual(quickPrimitives().map((p) => p.shortLabel), ["Client", "Gateway", "Service", "Database", "Cache", "Queue"]);
  const more = morePrimitivesByCategory().flatMap((c) => c.items.map((i) => i.kind));
  assert.equal(more.length, 16);
  assert.equal(new Set([...QUICK_KINDS, ...more]).size, 22);
  assert.ok(more.every((k) => !QUICK_KINDS.includes(k)));
});
