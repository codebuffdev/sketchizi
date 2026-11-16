import test from "node:test";
import assert from "node:assert/strict";
import { parseDocument } from "yaml";
import { readFile } from "node:fs/promises";
import { updateComposeServiceImage } from "../src/features/docker-compose/composeYamlEdits.js";

test("visual image edit preserves YAML comments, other services, and extensions", () => {
  const source = "# infrastructure\nservices:\n  # web note\n  web:\n    image: nginx:1.27\n  db:\n    image: postgres:16\nx-meta:\n  owner: infra\n";
  const output = updateComposeServiceImage(source, "web", "nginx:1.28");
  assert.match(output, /# infrastructure/);
  assert.match(output, /# web note/);
  const parsed = parseDocument(output).toJS();
  assert.equal(parsed.services.web.image, "nginx:1.28");
  assert.equal(parsed.services.db.image, "postgres:16");
  assert.equal(parsed["x-meta"].owner, "infra");
});

test("invalid image and missing service do not silently change YAML", () => {
  const source = "services:\n  web:\n    image: nginx\n";
  assert.throws(() => updateComposeServiceImage(source, "web", "  "), /cannot be empty/);
  assert.throws(() => updateComposeServiceImage(source, "missing", "nginx:2"), /no longer exists/);
  assert.throws(() => updateComposeServiceImage("services: [\n", "web", "nginx:2"));
});

test("Compose Studio wires its image field to the tested YAML editing helper", async () => {
  const source = await readFile(new URL("../src/features/docker-compose/ui/DockerComposeStudio.jsx", import.meta.url), "utf8");
  assert.match(source, /updateComposeServiceImage\(yamlText, selectedService, image\)/);
  assert.match(source, /onBlur=\{\(event\) => updateSelectedServiceImage\(event\.target\.value\)\}/);
});
