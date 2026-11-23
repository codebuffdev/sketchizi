import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseKubernetesManifests, normalizeKubernetesManifest } from "../src/features/kubernetes-studio/kubernetesManifestModel.js";
import { parseComposeYaml } from "../src/features/docker-compose/composeYamlModel.js";
import { formatYamlError } from "../src/features/studio-validation/yamlErrors.js";
import { parseDocument } from "yaml";

const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

/** Malformed inputs both studios must reject with a located, actionable message. */
const BROKEN_SYNTAX = [
  ["tab indentation", "services:\n\tweb:\n\t\timage: nginx\n", /line 2/i, /tab/i],
  ["unclosed flow sequence", "services:\n  web:\n    image: nginx\n    ports: [\"80:80\"\n", /line \d+/i, null],
  ["duplicate keys", "services:\n  web:\n    image: a\n    image: b\n", /line 4/i, /duplicate/i],
  ["bad indentation", "services:\n  web:\n    image: nginx\n   restart: always\n", /line 4/i, null],
  ["unterminated quote", "services:\n  web:\n    image: \"nginx\n", /line \d+/i, null],
];

for (const [label, yaml, lineMatcher, hintMatcher] of BROKEN_SYNTAX) {
  test(`Compose: ${label} yields a located, actionable error and no document`, () => {
    const result = parseComposeYaml(yaml);
    assert.equal(result.document, null);
    assert.match(result.error, /^YAML syntax error/);
    assert.match(result.error, lineMatcher);
    if (hintMatcher) assert.match(result.error, hintMatcher);
    assert.ok(result.errors.length >= 1 && result.errors[0].message === result.error);
    assert.ok(Number.isInteger(result.errors[0].line), "structured errors expose the line number");
  });

  test(`Kubernetes: ${label} yields a located, actionable error and no resources`, () => {
    const result = parseKubernetesManifests(yaml.replace("services:", "metadata:"));
    assert.deepEqual(result.resources, []);
    assert.match(result.parseError, /syntax error/i);
    assert.match(result.parseError, lineMatcher);
    assert.ok(result.errors.length >= 1);
  });
}

test("undefined aliases and bad merge keys are reported with the alias guidance in both studios", () => {
  for (const yaml of ["services:\n  web:\n    <<: *missing\n", "services:\n  web:\n    image: *missing\n"]) {
    const compose = parseComposeYaml(yaml);
    assert.equal(compose.document, null);
    assert.match(compose.error, /anchors \(&name\), aliases \(\*name\) and merge keys/);
    const k8s = parseKubernetesManifests(yaml.replace("services:", "metadata:"));
    assert.deepEqual(k8s.resources, []);
    assert.match(k8s.parseError, /^Document 1 could not be read/);
  }
});

test("YAML syntax errors in later documents name the document and use whole-file line numbers", () => {
  const result = parseKubernetesManifests("apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ok\n---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n\tname: broken\n");
  assert.match(result.parseError, /^Document 2 YAML syntax error on line 9/);
});

test("the error message never leaks the raw multi-line parser dump", () => {
  const { message } = formatYamlError(parseDocument("a: [1\n", { prettyErrors: true }).errors[0]);
  assert.ok(!message.includes("\n"), "single-line message for the UI banner");
  assert.ok(!/\^/.test(message), "no ASCII caret snippet");
});

test("Compose rejects input that is not a Compose document, with guidance for each case", () => {
  const cases = [
    ["", "COMPOSE_EMPTY", /empty/i],
    ["# only a comment\n", "COMPOSE_EMPTY", /no content|empty/i],
    ["- a\n- b\n", "COMPOSE_NOT_A_MAPPING", /list/],
    ["just text", "COMPOSE_NOT_A_MAPPING", /single value/],
    ["name: demo\n", "COMPOSE_MISSING_SERVICES", /top-level "services"/],
    ["services:\n", "COMPOSE_EMPTY_SERVICES", /Define at least one service/],
    ["services: [web]\n", "COMPOSE_SERVICES_NOT_A_MAPPING", /list/],
    ["services: nginx\n", "COMPOSE_SERVICES_NOT_A_MAPPING", /single value/],
    ["a: 1\n---\nb: 2\n", "COMPOSE_MULTIPLE_DOCUMENTS", /2 YAML documents/],
    ["apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: x\n", "COMPOSE_LOOKS_LIKE_KUBERNETES", /Kubernetes Deployment.*Kubernetes Studio/],
  ];
  for (const [yaml, code, message] of cases) {
    const result = parseComposeYaml(yaml);
    assert.equal(result.document, null, JSON.stringify(yaml));
    assert.equal(result.errors[0].code, code, JSON.stringify(yaml));
    assert.match(result.error, message, JSON.stringify(yaml));
  }
  assert.equal(parseComposeYaml(undefined).errors[0].code, "COMPOSE_INPUT_NOT_TEXT");
  assert.equal(parseComposeYaml(42).errors[0].code, "COMPOSE_INPUT_NOT_TEXT");
});

test("Compose accepts BOM-prefixed files and warns about the obsolete version key", () => {
  const result = parseComposeYaml("\uFEFFversion: \"3.8\"\nservices:\n  web:\n    image: nginx:1\n");
  assert.equal(result.error, "");
  assert.deepEqual(result.warnings.map((warning) => warning.code), ["COMPOSE_VERSION_OBSOLETE"]);
  assert.equal(result.document.version, "3.8", "version is retained so export does not lose it");
});

test("Kubernetes explains each reason a document cannot be loaded", () => {
  const messages = (yaml) => parseKubernetesManifests(yaml).unsupported.join(" | ");
  assert.match(messages("metadata:\n  name: x\n"), /Document 1: missing kind\. Add a kind such as Deployment/);
  assert.match(messages("kind: Service\nmetadata: {}\n"), /Service is missing metadata\.name\. Add metadata\.name/);
  assert.match(messages("kind: Pod\nmetadata:\n  generateName: job-\n"), /generateName is only valid for objects created by the API server/);
  assert.match(messages("kind: not a kind\nmetadata:\n  name: x\n"), /"not a kind" is not a valid resource kind/);
  assert.match(messages("kind: [a]\nmetadata:\n  name: x\n"), /missing kind/);
  assert.match(messages("- a\n- b\n"), /expected a Kubernetes resource .* found a list/);
  assert.match(messages("just-a-string\n"), /found a string/);
});

test("Kubernetes loaded with a Compose file points the user at Compose Studio", () => {
  const result = parseKubernetesManifests("services:\n  web:\n    image: nginx\n");
  assert.deepEqual(result.resources, []);
  assert.match(result.parseError, /looks like a Docker Compose file/);
  assert.match(result.parseError, /Docker Compose Studio/);
  assert.equal(result.errors[0].code, "K8S_LOOKS_LIKE_COMPOSE");
});

test("a bad document does not prevent the valid ones from loading", () => {
  const result = parseKubernetesManifests("apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: good\n---\nkind: Service\n---\n- stray\n");
  assert.equal(result.parseError, "", "partial success is not a hard error");
  assert.deepEqual(result.resources.map((resource) => resource.name), ["good"]);
  assert.equal(result.skippedDocuments, 2);
  assert.equal(result.unsupported.length, 2);
});

test("when nothing loads, parseError summarises why so exports are blocked", () => {
  const result = parseKubernetesManifests("kind: Service\nmetadata: {}\n");
  assert.deepEqual(result.resources, []);
  assert.match(result.parseError, /^No Kubernetes resources could be loaded\. Document 1: Service is missing metadata\.name/);
});

test("non-text and null input never throw", () => {
  assert.doesNotThrow(() => parseKubernetesManifests(undefined));
  assert.match(parseKubernetesManifests({}).parseError, /must be provided as text/);
  assert.equal(normalizeKubernetesManifest(null, 1), null);
  assert.equal(normalizeKubernetesManifest({ kind: "Pod", metadata: {} }, 1), null);
  assert.equal(normalizeKubernetesManifest({ kind: "Pod", metadata: { name: 7 } }, 3).name, "7");
});

test("YAML alias bombs are rejected with an actionable message instead of hanging or crashing", () => {
  const bomb = ["a: &a [x,x,x,x,x,x,x,x,x]", ...Array.from({ length: 9 }, (_, i) => `${String.fromCharCode(98 + i)}: &${String.fromCharCode(98 + i)} [${Array(9).fill(`*${String.fromCharCode(97 + i)}`).join(",")}]`), "kind: ConfigMap", "metadata: { name: bomb }", "data: *j"].join("\n");
  const started = Date.now();
  const k8s = parseKubernetesManifests(bomb);
  const compose = parseComposeYaml(bomb.replace("kind: ConfigMap", "services: {}"));
  assert.ok(Date.now() - started < 3000, "must not expand exponentially");
  assert.match(k8s.parseError, /anchor|alias/i);
  assert.equal(compose.document, null);
});

test("the Studios use the shared, tested parsers instead of inline YAML handling", async () => {
  const [k8sStudio, composeStudio, app] = await Promise.all([
    read("src/features/kubernetes-studio/ui/KubernetesStudio.jsx"),
    read("src/features/docker-compose/ui/DockerComposeStudio.jsx"),
    read("src/App.jsx"),
  ]);
  assert.match(k8sStudio, /parseKubernetesManifests\(yamlText, \{ locateServiceSelector \}\)/);
  assert.doesNotMatch(k8sStudio, /function normalizeManifest\(value, index\)/);
  assert.match(k8sStudio, /resource comes from a List/);
  assert.match(composeStudio, /parseComposeYaml\(yamlText\)/);
  assert.match(composeStudio, /parseComposeYaml\(text\)/);
  assert.match(app, /getIngressBackendServiceNames\(ingress\.manifest\)/);
  assert.match(app, /workload\.namespace === service\.namespace && labelsMatch\(selector, labels\)/);
});
