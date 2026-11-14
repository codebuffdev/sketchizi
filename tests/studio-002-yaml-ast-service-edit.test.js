import test from "node:test";
import assert from "node:assert/strict";
import { parseDocument } from "yaml";
import { readFile } from "node:fs/promises";

test("adding a service via the YAML AST retains unrelated comments and extension fields", () => {
  const original = "# Team-owned Compose file\nservices:\n  # Do not remove this note\n  api:\n    image: nginx:1.27\nx-shared:\n  enabled: true\n";
  const document = parseDocument(original, { uniqueKeys: true });
  document.setIn(["services", "worker"], { image: "nginx:alpine", restart: "unless-stopped" });
  const updated = String(document);
  assert.match(updated, /# Team-owned Compose file/);
  assert.match(updated, /# Do not remove this note/);
  const value = parseDocument(updated).toJS();
  assert.equal(value.services.api.image, "nginx:1.27");
  assert.equal(value.services.worker.image, "nginx:alpine");
  assert.deepEqual(value["x-shared"], { enabled: true });
});

test("Compose Studio uses AST edits instead of serializing the entire mapping when adding services", async () => {
  const source = await readFile(new URL("../src/features/docker-compose/ui/DockerComposeStudio.jsx", import.meta.url), "utf8");
  assert.match(source, /yamlDocument\.setIn\(\["services", name\]/);
  assert.match(source, /setYamlText\(String\(yamlDocument\)\)/);
});
