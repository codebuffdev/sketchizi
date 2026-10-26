import test from "node:test";
import assert from "node:assert/strict";
import { parseAllDocuments } from "yaml";
import { renderHelmBundle, renderKustomizeBundle } from "../src/features/kubernetes-studio/browserBundleRenderer.js";

test("Kustomize bundle renders resources and applies namespace, name prefix, and common labels in-browser", () => {
  const files = [
    { name: "demo/kustomization.yaml", text: "apiVersion: kustomize.config.k8s.io/v1beta1\nkind: Kustomization\nnamespace: staging\nnamePrefix: shop-\ncommonLabels:\n  app.kubernetes.io/part-of: shop\nresources:\n  - deployment.yaml\n" },
    { name: "demo/deployment.yaml", text: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n        - name: web\n          image: nginx:1.27\n" },
  ];
  const rendered = renderKustomizeBundle(files, "demo/kustomization.yaml");
  const resource = parseAllDocuments(rendered)[0].toJSON();
  assert.equal(resource.metadata.name, "shop-web");
  assert.equal(resource.metadata.namespace, "staging");
  assert.equal(resource.metadata.labels["app.kubernetes.io/part-of"], "shop");
  assert.equal(resource.spec.replicas, 2);
});

test("Helm browser renderer renders values and release metadata from a chart ZIP", () => {
  const files = [
    { name: "chart/Chart.yaml", text: "apiVersion: v2\nname: storefront\nversion: 1.0.0\n" },
    { name: "chart/values.yaml", text: "replicas: 2\nimage: nginx:1.27\n" },
    { name: "chart/values-production.yaml", text: "replicas: 4\nimage: nginx:1.28\n" },
    { name: "chart/templates/deployment.yaml", text: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {{ .Release.Name }}\nspec:\n  replicas: {{ .Values.replicas }}\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n        - name: web\n          image: {{ .Values.image }}\n" },
  ];
  const rendered = renderHelmBundle(files, "chart/Chart.yaml", "chart/values-production.yaml", "shop");
  const resource = parseAllDocuments(rendered)[0].toJSON();
  assert.equal(resource.metadata.name, "shop");
  assert.equal(resource.spec.replicas, 4);
  assert.equal(resource.spec.template.spec.containers[0].image, "nginx:1.28");
});

test("Helm browser renderer fails explicitly instead of silently accepting unsupported template functions", () => {
  const files = [
    { name: "chart/Chart.yaml", text: "apiVersion: v2\nname: storefront\nversion: 1.0.0\n" },
    { name: "chart/templates/deployment.yaml", text: "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: {{ include \"common.fullname\" . }}\n" },
  ];
  assert.throws(() => renderHelmBundle(files, "chart/Chart.yaml"), /helper|unsupported|not supported/i);
});
