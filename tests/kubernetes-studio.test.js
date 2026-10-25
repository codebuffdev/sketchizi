import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);

test("K8s Studio is exposed beside Docker Studio in the app header", async () => {
  const app = await readFile(new URL("src/App.jsx", root), "utf8");
  assert.match(app, /className="docker-compose-studio-toggle"/);
  assert.match(app, /className="kubernetes-studio-header-toggle"/);
  assert.match(app, /aria-label="Open K8s Studio"/);
  assert.match(app, /<KubernetesStudio\s+icons=\{kubernetesIcons\}/);
});

test("K8s Studio uses the existing Kubernetes catalog and resource insertion service", async () => {
  const app = await readFile(new URL("src/App.jsx", root), "utf8");
  const studio = await readFile(new URL("src/features/kubernetes/ui/KubernetesStudio.jsx", root), "utf8");
  assert.match(app, /import \{ insertKubernetesResource \} from "\.\/features\/kubernetes-resources\/kubernetesResourceService\.js"/);
  assert.match(app, /await insertKubernetesResource\(/);
  assert.match(studio, /icons=\{\}/);
  assert.match(studio, /icon\.searchAliases/);
  assert.match(studio, /aria-pressed=\{selected\}/);
  assert.match(studio, /Add to canvas/);
});

test("K8s Studio starter architectures use resource IDs present in the catalog", async () => {
  const [studio, catalog] = await Promise.all([
    readFile(new URL("src/features/kubernetes/ui/KubernetesStudio.jsx", root), "utf8"),
    readFile(new URL("src/kubernetesArchitectureLibrary.js", root), "utf8"),
  ]);
  const starterIds = [...studio.matchAll(/"((?:k8s):[a-z0-9-]+)"/g)].map((match) => match[1]);
  assert.ok(starterIds.length >= 12, "expected multiple resource IDs across starter architectures");
  for (const id of new Set(starterIds)) {
    assert.ok(catalog.includes(`"${id.slice(4)}"`) || catalog.includes(`"${id.replace("k8s:", "")}"`) || catalog.includes(`"${id}"`), `starter resource ${id} should have a catalog definition`);
  }
});

test("K8s Studio workspace has responsive catalog and selection layouts", async () => {
  const css = await readFile(new URL("src/features/kubernetes/ui/kubernetes-studio.css", root), "utf8");
  assert.match(css, /\.k8s-studio-resource-view\s*\{[^}]*grid-template-columns/s);
  assert.match(css, /@media\s*\(max-width:\s*900px\)/);
  assert.match(css, /@media\s*\(max-width:\s*600px\)/);
});
