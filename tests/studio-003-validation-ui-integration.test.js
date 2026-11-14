import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("both studios adapt domain findings into shared diagnostics before rendering", async () => {
  const compose = await readFile(new URL("../src/features/docker-compose/ui/DockerComposeStudio.jsx", import.meta.url), "utf8");
  const kubernetes = await readFile(new URL("../src/features/kubernetes-studio/ui/KubernetesStudio.jsx", import.meta.url), "utf8");
  assert.match(compose, /normalizeStudioDiagnostics\("docker-compose", validation\.findings\)/);
  assert.match(kubernetes, /normalizeStudioDiagnostics\("kubernetes", parsed\.issues\)/);
  assert.match(compose, /diagnostics\.map\(\(finding\) => <article key=\{finding\.id\}/);
  assert.match(kubernetes, /diagnostics\.map\(\(issue\) => <li key=\{issue\.id\}/);
  assert.match(kubernetes, /<strong>\{issue\.resource\}<\/strong>/);
});

test("diagnostic navigation is explicit and does not auto-apply fixes", async () => {
  const compose = await readFile(new URL("../src/features/docker-compose/ui/DockerComposeStudio.jsx", import.meta.url), "utf8");
  const kubernetes = await readFile(new URL("../src/features/kubernetes-studio/ui/KubernetesStudio.jsx", import.meta.url), "utf8");
  assert.match(compose, /aria-label=\{"Select service " \+ finding\.path\.split\("\."\)\[1\]\}/);
  assert.match(kubernetes, /aria-label=\{"Inspect " \+ issue\.resource\}/);
  assert.match(kubernetes, /if \(target\) inspectResource\(target\)/);
});
