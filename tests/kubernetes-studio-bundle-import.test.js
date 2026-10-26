import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const reader = await readFile(resolve(root, "src/features/kubernetes-studio/zipBundleReader.js"), "utf8");
const studio = await readFile(resolve(root, "src/features/kubernetes-studio/ui/KubernetesStudio.jsx"), "utf8");

test("ZIP bundle reader selects YAML and Kubernetes source files by extension", () => {
  assert.match(reader, /!\/\\\.(?:ya\?ml)\$\/i\.test\(name\)/);
  assert.doesNotMatch(reader, /!\/\\\\\.(?:ya\?ml)\$\/i\.test\(name\)/);
});

test("K8s Studio accepts ZIP files and provides a separate folder picker", () => {
  assert.match(studio, /accept="\.zip,application\/zip,application\/x-zip-compressed"/);
  assert.match(studio, /id="k8s-studio-source-folder" type="file" webkitdirectory/);
  assert.match(studio, /readZipTextFiles\(selectedFiles\[0\]\)/);
});

test("K8s Studio clears example YAML when a source bundle is detected", () => {
  assert.match(studio, /Kustomize bundle loaded/);
  assert.match(studio, /Helm bundle loaded/);
  assert.match(studio, /setYamlText\("\\"\);\s*setSavedYamlText\("\\"\);\s*setImportedFileNames\(paths\)/);
});
