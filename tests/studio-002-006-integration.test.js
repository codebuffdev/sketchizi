import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Compose Studio combines document editing, diagnostics, conversion and dependency exploration", async () => {
  const source = await readFile(new URL("../src/features/docker-compose/ui/DockerComposeStudio.jsx", import.meta.url), "utf8");
  for (const feature of [
    "updateComposeServiceImage",
    "normalizeStudioDiagnostics",
    "convertComposeToKubernetes",
    "traceComposeDependencies",
    "exploreComposeNetworkReachability",
    "Kubernetes conversion preview",
    "Dependency path explorer",
  ]) assert.ok(source.includes(feature), "Missing integrated Compose feature: " + feature);
});
test("Kubernetes Studio combines diagnostics and read-only snapshot inspection", async () => {
  const source = await readFile(new URL("../src/features/kubernetes-studio/ui/KubernetesStudio.jsx", import.meta.url), "utf8");
  for (const feature of ["normalizeStudioDiagnostics", "summarizeKubernetesSnapshot", "Inspect read-only Kubernetes snapshot", "Review suggested correction"]) {
    assert.ok(source.includes(feature), "Missing integrated Kubernetes feature: " + feature);
  }
});
