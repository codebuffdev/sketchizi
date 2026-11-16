import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Kubernetes diagrams use compact cards with editable bound relationships", async () => {
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const start = app.indexOf("const createKubernetesDiagram =");
  const end = app.indexOf("const createComposeDiagram =", start);
  assert.ok(start >= 0, "Kubernetes generator exists");
  const generator = app.slice(start, end > start ? end : undefined);
  assert.match(generator, /const cardWidth = 284/);
  assert.match(generator, /const cardHeight = 132/);
  assert.match(generator, /const maxPerRow = 4/);
  assert.match(generator, /resourceRectangles\.set/);
  assert.match(generator, /fromRectangle\.boundElements\.push/);
  assert.match(generator, /toRectangle\.boundElements\.push/);
  assert.match(generator, /kubernetesManifestResource: metadata/);
});
