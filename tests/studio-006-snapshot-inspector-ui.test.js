import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Kubernetes Studio exposes read-only JSON snapshot inspection without cluster access", async () => {
  const source = await readFile(new URL("../src/features/kubernetes-studio/ui/KubernetesStudio.jsx", import.meta.url), "utf8");
  assert.match(source, /summarizeKubernetesSnapshot\(items\)/);
  assert.match(source, /Inspect read-only Kubernetes snapshot/);
  assert.match(source, /JSON\.parse\(snapshotText\)/);
  assert.match(source, /no cluster connection or deployment occurs/);
});
