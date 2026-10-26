import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reader = await readFile(resolve(root, "src/features/kubernetes-studio/zipBundleReader.js"), "utf8");
const studio = await readFile(resolve(root, "src/features/kubernetes-studio/ui/KubernetesStudio.jsx"), "utf8");

test("ZIP bundle reader selects YAML and Kubernetes source files by extension", () => {
  assert.ok(reader.includes(String.raw`if (!/\.(?:ya?ml)$/i.test(name)) continue;`), "YAML extension matching must use a literal dot");
  assert.ok(!reader.includes(String.raw`if (!/\\.(?:ya?ml)$/i.test(name)) continue;`), "the extension matcher must not require a backslash");
});

test("K8s Studio accepts ZIP files and provides a separate folder picker", () => {
  assert.match(studio, /accept="\.zip,application\/zip,application\/x-zip-compressed"/);
  assert.match(studio, /id="k8s-studio-source-folder" type="file" webkitdirectory/);
  assert.match(studio, /readZipTextFiles\(selectedFiles\[0\]\)/);
});

test("K8s Studio clears example YAML when a source bundle is detected", () => {
  assert.match(studio, /Bundle loaded\. Choose a Kustomize overlay or Helm chart below/);
  assert.match(studio, /bundleSources/);
  assert.ok(studio.includes('setYamlText("");\n      setSavedYamlText("");\n      setImportedFileNames(paths);'));
  assert.match(studio, /renderKustomizeBundle\(bundleFiles, source\.path\)/);
  assert.match(studio, /renderHelmBundle\(bundleFiles, source\.path, selectedValuesFile/);
  assert.doesNotMatch(studio, /VITE_K8S_RENDER_URL|fetch\(rendererUrl/);
});
