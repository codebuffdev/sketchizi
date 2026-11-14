import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Kubernetes diagnostics must initialize after parsed manifests", async () => {
  const source = await readFile(new URL("../src/features/kubernetes-studio/ui/KubernetesStudio.jsx", import.meta.url), "utf8");
  const parsed = source.indexOf("const parsed = useMemo(");
  const diagnostics = source.indexOf('const diagnostics = useMemo(() => normalizeStudioDiagnostics("kubernetes", parsed.issues)');
  assert.ok(parsed >= 0 && diagnostics > parsed, "Diagnostics must not reference parsed before initialization");
});
