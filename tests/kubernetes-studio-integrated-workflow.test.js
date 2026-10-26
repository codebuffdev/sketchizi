import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(resolve(root, "src/features/kubernetes-studio/ui/KubernetesStudio.jsx"), "utf8");

test("K8s Studio offers multi-select YAML import and validates the complete file set", () => {
  assert.match(source, /type="file" accept="\.yaml,\.yml,application\/yaml,text\/yaml" multiple hidden onChange=\{importFile\}/);
  assert.match(source, /Promise\.all\(files\.map\(async \(file\) =>/);
  assert.match(source, /duplicate resources:/);
  assert.match(source, /must include kind and metadata\.name/);
});

test("K8s Studio does not replace YAML text with a re-serialized form during export", () => {
  const exportStart = source.indexOf("  const exportYaml = () => {");
  const exportEnd = source.indexOf("\n\n  const importFile", exportStart);
  assert.ok(exportStart >= 0 && exportEnd > exportStart, "export function should be present");
  const exportFunction = source.slice(exportStart, exportEnd);
  assert.match(exportFunction, /new Blob\(\[yamlText\]/);
  assert.match(exportFunction, /Validation does not rewrite your YAML/);
  assert.doesNotMatch(exportFunction, /stringify\(/);
});

test("inspector edits validate resource identity and duplicate names before canvas update", () => {
  const applyStart = source.indexOf("  const applyInspectedResource = () => {");
  const applyEnd = source.indexOf("\n  const exportYaml", applyStart);
  assert.ok(applyStart >= 0 && applyEnd > applyStart, "inspector apply function should be present");
  const applyFunction = source.slice(applyStart, applyEnd);
  assert.match(applyFunction, /Changing the resource kind is not supported/);
  assert.match(applyFunction, /already exists in namespace/);
  assert.ok(applyFunction.indexOf("onApplyResourceYaml?.") < applyFunction.indexOf("setYamlText(nextYaml)"), "update the canvas before committing the YAML draft");
  assert.match(applyFunction, /original YAML remains unchanged/);
});

test("diagram creation blocks validation errors while allowing reviewed warnings", () => {
  const start = source.indexOf("  const createDiagram = async () => {");
  const end = source.indexOf("\n\n  return (", start);
  assert.ok(start >= 0 && end > start, "diagram creation function should be present");
  const createFunction = source.slice(start, end);
  assert.match(createFunction, /parsed\.issues\.filter\(\(issue\) => issue\.severity === "error"\)/);
  assert.match(createFunction, /Warnings can be reviewed and accepted/);
});

test("multi-file import resets source tracking consistently when cleared", () => {
  assert.match(source, /setImportedFileNames\(\[\]\)/);
  assert.match(source, /setHasInspectedEdits\(false\)/);
  assert.match(source, /setImportedFileNames\(importedFiles\.map\(\(file\) => file\.name\)\)/);
});
