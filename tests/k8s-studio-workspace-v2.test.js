import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Kubernetes preview separates resources and validation without losing inspection", async () => {
  const [studio, styles] = await Promise.all([
    read("src/features/kubernetes-studio/ui/KubernetesStudio.jsx"),
    read("src/features/kubernetes-studio/ui/kubernetes-studio.css"),
  ]);
  assert.match(studio, /role="tablist" aria-label="Resource preview views"/);
  assert.match(studio, /previewTab === "resources"/);
  assert.match(studio, /previewTab === "validation"/);
  assert.match(studio, /inspectResource\(resource\)/);
  assert.match(studio, /role="status">No validation findings/);
  assert.match(styles, /grid-template-columns:repeat\(auto-fit,minmax\(190px,1fr\)\)/);
});
