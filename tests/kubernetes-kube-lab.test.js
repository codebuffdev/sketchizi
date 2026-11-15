import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "yaml";
import { inspectKubeLabDraft, kubeLabLessons, readKubeLabDrafts } from "../src/features/kubernetes-studio/practice/kubeLab.js";
import { validateKubernetesResources } from "../src/features/kubernetes-studio/validation/validateKubernetesResources.js";

const toResource = (manifest) => ({
  id: "exercise",
  kind: manifest.kind,
  namespace: manifest.metadata.namespace || "default",
  apiVersion: manifest.apiVersion,
  name: manifest.metadata.name,
  manifest,
});

function validate(manifest) {
  const resources = [toResource(manifest)];
  return { resources, issues: validateKubernetesResources(resources), parseError: "", skippedDocuments: 0 };
}

const corrected = {
  manifests(pod) {
    pod.metadata.name = "web-lab";
    pod.spec.containers[0].image = "nginx:alpine";
    pod.spec.containers[0].ports[0].containerPort = 80;
  },
  labels(deployment) {
    deployment.spec.selector.matchExpressions = [{ key: "env", operator: "In", values: ["dev", "staging"] }];
  },
  services(service) {
    service.spec.selector.app = "orders";
  },
};

for (const lesson of kubeLabLessons) {
  test(`Kube Lab rejects the ${lesson.id} starter and accepts the corrected manifest`, () => {
    const manifest = parse(lesson.starter);
    const initial = inspectKubeLabDraft(lesson.id, validate(manifest));
    assert.ok(initial.failures.length);
    corrected[lesson.id](manifest);
    const finished = inspectKubeLabDraft(lesson.id, validate(manifest));
    assert.deepEqual(finished.failures, []);
    assert.equal(finished.connected, true);
  });
}

test("Service practice distinguishes selector, namespace, target port, and exercise requirements", () => {
  const service = parse(kubeLabLessons.find(({ id }) => id === "services").starter);
  const inspect = () => inspectKubeLabDraft("services", validate(service));
  assert.match(inspect().summary, /No Pods match app=api/);
  service.spec.selector.app = "orders";
  service.spec.ports[0].targetPort = "http";
  assert.equal(inspect().connected, true);
  assert.deepEqual(inspect().failures, []);
  service.spec.ports[0].port = 81;
  assert.equal(inspect().connected, true);
  assert.equal(inspect().failures.length, 1);
  service.spec.ports[0].port = 80;
  service.spec.ports[0].targetPort = 80;
  assert.equal(inspect().connected, false);
  service.spec.ports[0].targetPort = 8080;
  service.metadata.namespace = "staging";
  assert.equal(inspect().connected, false);
  assert.match(inspect().summary, /default namespace/);
});

test("Studio accepts expression-only selectors and rejects rules that exclude the Pod template", () => {
  const deployment = parse(kubeLabLessons.find(({ id }) => id === "labels").starter);
  deployment.spec.selector = { matchExpressions: [{ key: "env", operator: "In", values: ["staging"] }] };
  const errors = () => validate(deployment).issues.filter((issue) => issue.severity === "error");
  assert.deepEqual(errors(), []);
  deployment.spec.selector.matchExpressions[0].values = ["dev"];
  assert.match(errors()[0].message, /must match spec.template.metadata.labels/);
  deployment.spec.selector.matchExpressions[0] = null;
  assert.match(errors()[0].message, /must match spec.template.metadata.labels/);
});

test("Kube Lab reports parser and incomplete-document errors instead of passing an exercise", () => {
  assert.match(inspectKubeLabDraft("services", { parseError: "line 3" }).problem, /line 3/);
  assert.match(inspectKubeLabDraft("labels", { resources: [{}], skippedDocuments: 1 }).problem, /one Kubernetes manifest/);
});

test("Kube Lab restores only valid practice drafts and tolerates unavailable storage", () => {
  const getDrafts = (saved) => readKubeLabDrafts({ getItem: () => saved });
  assert.deepEqual(getDrafts(JSON.stringify({ manifests: "", services: "# draft", labels: 42, other: "ignored" })), { manifests: "", services: "# draft" });
  assert.deepEqual(getDrafts("broken JSON"), {});
  assert.deepEqual(readKubeLabDrafts({ getItem() { throw new Error("blocked"); } }), {});
});
