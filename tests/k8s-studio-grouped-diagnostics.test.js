import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Kubernetes Studio groups validation findings per resource without editing YAML", async () => {
  const source = await readFile(new URL("../src/features/kubernetes-studio/ui/KubernetesStudio.jsx", import.meta.url), "utf8");
  assert.match(source, /const diagnosticGroups = useMemo/);
  assert.match(source, /diagnosticGroups\.map\(\(\[resourceName, findings\]\)/);
  assert.match(source, /findings\.map\(\(issue\)/);
  assert.match(source, /inspectResource\(target\)/);
  assert.match(source, /Guidance only · Manifest YAML is unchanged/);
  assert.match(source, /<summary>View suggested fix<\/summary>/);
});
test("Diagnostic controls have scoped dark styling and keyboard focus", async () => {
  const css = await readFile(new URL("../src/features/kubernetes-studio/ui/kubernetes-studio.css", import.meta.url), "utf8");
  assert.match(css, /\.k8s-studio-diagnostic-group/);
  assert.match(css, /\.k8s-studio-diagnostic-inspect:focus-visible/);
  assert.match(css, /\.k8s-studio-diagnostic-fix>summary/);
});
