import test from "node:test";
import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  KUBERNETES_CATALOG_ID,
  KUBERNETES_SOURCE,
  KUBERNETES_CATALOG_NAME,
  kubernetesCategories,
  kubernetesIcons,
  kubernetesCategoryCounts,
  kubernetesCategoryRepresentatives,
} from "../src/kubernetesArchitectureLibrary.js";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

test("Kubernetes catalog exposes stable provider identity", () => {
  assert.equal(KUBERNETES_CATALOG_ID, "kubernetes-architecture");
  assert.equal(KUBERNETES_SOURCE, "kubernetes");
  assert.equal(KUBERNETES_CATALOG_NAME, "Kubernetes");
});

test("every Kubernetes icon has a unique stable ID and complete metadata", () => {
  assert.ok(kubernetesIcons.length > 0);
  const ids = kubernetesIcons.map((icon) => icon.id);
  assert.equal(new Set(ids).size, ids.length, "catalog icon IDs must be unique");

  for (const icon of kubernetesIcons) {
    assert.match(icon.id, /^k8s:[a-z0-9-]+$/);
    assert.equal(icon.source, KUBERNETES_SOURCE);
    assert.equal(icon.catalog, KUBERNETES_CATALOG_ID);
    assert.ok(icon.name.trim(), `${icon.id} needs a name`);
    assert.ok(icon.subtitle.trim(), `${icon.id} needs a description`);
    assert.ok(icon.category.trim(), `${icon.id} needs a category`);
    assert.ok(Array.isArray(icon.searchAliases), `${icon.id} needs search aliases`);
    assert.ok(icon.searchAliases.includes("kubernetes"));
    assert.ok(icon.searchAliases.includes("k8s"));
    assert.match(icon.src, /^\/kubernetes-icons\/[^/]+\.svg$/);
  }
});

test("all catalog categories have valid counts and representative icons", () => {
  assert.equal(new Set(kubernetesCategories).size, kubernetesCategories.length);
  for (const category of kubernetesCategories) {
    const count = kubernetesIcons.filter((icon) => icon.category === category).length;
    assert.equal(kubernetesCategoryCounts[category], count);
    if (count > 0) {
      const representativeId = kubernetesCategoryRepresentatives[category];
      assert.ok(kubernetesIcons.some((icon) => icon.id === representativeId && icon.category === category));
    }
  }
  assert.ok(kubernetesIcons.every((icon) => kubernetesCategories.includes(icon.category)));
});

test("every Kubernetes catalog icon points to an existing local SVG asset", async () => {
  for (const icon of kubernetesIcons) {
    const assetPath = path.join(projectRoot, "public", icon.src.replace(/^\//, ""));
    await assert.doesNotReject(
      access(assetPath),
      `${icon.name} points to missing artwork at ${icon.src}`,
    );
  }
});

test("important Kubernetes resources remain discoverable by common aliases", () => {
  const byId = new Map(kubernetesIcons.map((icon) => [icon.id, icon]));
  for (const [id, alias] of [
    ["k8s:api-server", "apiserver"],
    ["k8s:pod", "pods"],
    ["k8s:deployment", "deployments"],
    ["k8s:service", "services"],
    ["k8s:namespace", "namespaces"],
    ["k8s:custom-resource-definition", "crd"],
  ]) {
    assert.ok(byId.has(id), `missing catalog entry ${id}`);
    assert.ok(byId.get(id).searchAliases.includes(alias), `${id} must retain alias ${alias}`);
  }
});

test("Kubernetes catalog remains wired into existing search and insertion flows", async () => {
  const fs = await import("node:fs/promises");
  const catalogHook = await fs.readFile(
    new URL("../src/features/icon-library/useIconCatalog.js", import.meta.url),
    "utf8",
  );
  const panel = await fs.readFile(
    new URL("../src/IconLibraryPanel.jsx", import.meta.url),
    "utf8",
  );
  const insertion = await fs.readFile(
    new URL("../src/features/icon-library/iconInsertionService.js", import.meta.url),
    "utf8",
  );
  assert.match(catalogHook, /import \{ kubernetesIcons \} from "\.\.\/\.\.\/kubernetesArchitectureLibrary"/);
  assert.match(catalogHook, /activeCategory === "Kubernetes"/);
  assert.match(panel, /activeSource === "kubernetes"/);
  assert.match(panel, /activeKubernetesCategory/);
  assert.match(insertion, /insertKubernetesResource/);
  assert.match(insertion, /isIntelligentKubernetesResourceIcon/);
});
