import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseAllDocuments, stringify } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(resolve(root, "src/features/kubernetes-studio/ui/KubernetesStudio.jsx"), "utf8");

test("container completions expose manifest fields instead of only two example names", () => {
  const completionStart = source.indexOf('const fieldGroups = {');
  const completionEnd = source.indexOf('choices.forEach((entry) => add(entry, parent ?', completionStart);
  assert.ok(completionStart >= 0 && completionEnd > completionStart, "context-aware field groups should exist");
  const containerGroup = source.slice(completionStart, completionEnd);
  assert.match(containerGroup, /containers:\s*\["- name: app", "image:", "ports:", "env:", "resources:", "volumeMounts:", "command:", "args:"\]/);
  assert.doesNotMatch(source, /choices = \["- name: app", "- name: web"\]/);
});

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
  assert.match(source, /setImportedFileNames\(importedFiles\.map\(\(file\) => file\.name\)\)/);
});


test("K8s diagram relationships cover namespace membership, storage, scheduling and StatefulSet services", async () => {
  const app = await readFile(resolve(root, "src/App.jsx"), "utf8");
  assert.match(app, /clusterScopedKinds/);
  assert.match(app, /addRelationship\(claim, storageClass, "provisioned by"/);
  assert.match(app, /addRelationship\(statefulSet, service, "governed by"/);
  assert.match(app, /addRelationship\(pod, node, "runs on"/);
  assert.match(app, /workload\.kind === "CronJob"\s*\?\s*workload\.manifest\?\.spec\?\.jobTemplate\?\.spec\?\.template\?\.spec/);
  assert.match(app, /targetKind === "ClusterRole"/);
});


test("inspector updates replace only the edited YAML document source range", () => {
  const applyStart = source.indexOf("  const applyInspectedResource = () => {");
  const applyEnd = source.indexOf("\n  const exportYaml", applyStart);
  const applyFunction = source.slice(applyStart, applyEnd);
  assert.match(applyFunction, /const sourceRange = targetDocument\.range/);
  assert.match(applyFunction, /yamlText\.slice\(0, sourceRange\[0\]\) \+ replacementText \+ separator \+ suffix/);
  assert.doesNotMatch(applyFunction, /documents\.map\(\(document\) => document\.toString\(\)/);
  assert.match(applyFunction, /original YAML remains unchanged/);
});


test("source-range replacement preserves unrelated manifest text and comments byte-for-byte", () => {
  const original = [
    "# header comment",
    "apiVersion: v1",
    "kind: ConfigMap",
    "metadata:",
    "  name: first",
    "data:",
    '  greeting: "hello"',
    "---",
    "# preserve this comment exactly",
    "apiVersion: v1",
    "kind: Secret",
    "metadata:",
    "  name: second",
    "stringData:",
    '  token: "keep: colon"',
    "",
  ].join("\n");
  const documents = parseAllDocuments(original, { prettyErrors: true, uniqueKeys: true });
  assert.equal(documents.length, 2);
  const untouchedText = original.slice(documents[1].range[0], documents[1].range[2]);
  const edited = documents[0].toJSON();
  edited.data.greeting = "updated";
  const replacement = stringify(edited).trimEnd();
  const range = documents[0].range;
  const suffix = original.slice(range[2]);
  const suffixHasSeparator = /^\s*(?:#.*\n)*---(?:\s|#|$)/.test(suffix);
  const separator = documents.length > 1 ? (suffixHasSeparator ? (replacement.endsWith("\n") ? "" : "\n") : "\n---\n") : "";
  const next = original.slice(0, range[0]) + replacement + separator + suffix;
  assert.ok(next.includes(untouchedText), "the untouched document's source range must remain byte-for-byte");
  assert.ok(next.includes("# preserve this comment exactly"));
  const reparsed = parseAllDocuments(next, { prettyErrors: true, uniqueKeys: true });
  assert.equal(reparsed.length, 2);
  assert.equal(reparsed[0].toJSON().data.greeting, "updated");
  assert.equal(reparsed[1].toJSON().metadata.name, "second");
  assert.equal(reparsed[1].toJSON().stringData.token, "keep: colon");
});

test("YAML completion dismissal is scoped to the current line and Ctrl+Space reopens it", () => {
  assert.match(source, /const \[dismissedCompletionLine, setDismissedCompletionLine\] = useState\(null\)/);
  assert.match(source, /if \(force\) setDismissedCompletionLine\(null\)/);
  assert.match(source, /else if \(dismissedCompletionLine === lineStart\)/);
  assert.match(source, /setDismissedCompletionLine\(lineStart\);/);
  assert.match(source, /event\.code === "Space"/);
  assert.match(source, /"ArrowUp", "ArrowDown"/);
});
