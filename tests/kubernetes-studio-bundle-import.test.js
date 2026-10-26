import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reader = await readFile(resolve(root, "src/features/kubernetes-studio/zipBundleReader.js"), "utf8");
const studio = await readFile(resolve(root, "src/features/kubernetes-studio/ui/KubernetesStudio.jsx"), "utf8");

test("ZIP bundle reader retains YAML and Helm helper text files by extension", () => {
  assert.ok(reader.includes(String.raw\`/\.(?:ya?ml|tpl|json|txt|properties|conf)$/i.test(name)\`), "ZIP imports must retain Helm helper and text files");
});

test("K8s Studio accepts ZIP files and provides a separate folder picker", () => {
  assert.match(studio, /accept="\.zip,application\/zip,application\/x-zip-compressed"/);
  assert.match(studio, /id="k8s-studio-source-folder" type="file" webkitdirectory/);
  assert.match(studio, /readZipTextFiles\(selectedFiles\[0\]\)/);
});

test("K8s Studio clears example YAML when a source bundle is detected", () => {
  assert.match(studio, /Bundle loaded\. Select an environment and render it to populate the resource preview/);
  assert.match(studio, /bundleSources/);
  assert.ok(studio.includes('setYamlText("");\n      setSavedYamlText("");\n      setImportedFileNames(paths);'));
  assert.match(studio, /renderKustomizeBundle\(bundleFiles, source\.path\)/);
  assert.match(studio, /renderHelmBundle\(bundleFiles, source\.path, selectedValuesFile/);
  assert.doesNotMatch(studio, /VITE_K8S_RENDER_URL|fetch\(rendererUrl/);
});
