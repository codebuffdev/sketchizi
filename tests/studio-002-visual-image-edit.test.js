import test from "node:test";
import assert from "node:assert/strict";
import { parseDocument } from "yaml";
import { readFile } from "node:fs/promises";

test("visual service image edit preserves YAML comments and unrelated services", () => {
  const source = "# infrastructure\nservices:\n  web:\n    image: nginx:1.27\n  db:\n    image: postgres:16\nx-meta:\n  owner: infra\n";
  const document = parseDocument(source, { uniqueKeys: true });
  document.setIn(["services", "web", "image"], "nginx:1.28");
  const output = String(document);
  assert.match(output, /# infrastructure/);
  const parsed = parseDocument(output).toJS();
  assert.equal(parsed.services.web.image, "nginx:1.28");
  assert.equal(parsed.services.db.image, "postgres:16");
  assert.equal(parsed["x-meta"].owner, "infra");
});

test("Compose Studio exposes editable service image and applies AST update", async () => {
  const source = await readFile(new URL("../src/features/docker-compose/ui/DockerComposeStudio.jsx", import.meta.url), "utf8");
  assert.match(source, /const updateSelectedServiceImage = \(nextImage\) =>/);
  assert.match(source, /yamlDocument\.setIn\(\["services", selectedService, "image"\], image\)/);
  assert.match(source, /onBlur=\{\(event\) => updateSelectedServiceImage\(event\.target\.value\)\}/);
});
