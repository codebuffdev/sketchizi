import test from "node:test";
import assert from "node:assert/strict";
import { parseAllDocuments } from "yaml";
import { renderHelmBundle } from "../src/features/kubernetes-studio/browserBundleRenderer.js";

test("Helm browser renderer supports helper functions, nested conditionals, with, and range", () => {
  const files = [
    { name: "chart/Chart.yaml", text: "apiVersion: v2\nname: storefront\nversion: 1.0.0\nappVersion: 2.3.4\n" },
    { name: "chart/values.yaml", text: "nameOverride: \"\"\nfullnameOverride: \"\"\nreplicaCount: 3\nautoscaling:\n  enabled: false\npodAnnotations:\n  team: platform\ncontainers:\n  - name: api\n    image: example/api:1\n  - name: worker\n    image: example/worker:1\n" },
    { name: "chart/templates/_helpers.tpl", text: "{{- define \"demo.fullname\" -}}\n{{- if .Values.fullnameOverride -}}\n{{- .Values.fullnameOverride -}}\n{{- else -}}\n{{- $name := default .Chart.Name .Values.nameOverride -}}\n{{- if contains $name .Release.Name -}}\n{{- .Release.Name -}}\n{{- else -}}\n{{- printf \"%s-%s\" .Release.Name $name -}}\n{{- end -}}\n{{- end -}}\n{{- end -}}\n{{- define \"demo.labels\" -}}\napp: {{ include \"demo.fullname\" . }}\nrelease: {{ .Release.Name }}\n{{- end -}}\n" },
    { name: "chart/templates/deployment.yaml", text: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: {{ include \"demo.fullname\" . }}\n  labels:\n    {{- include \"demo.labels\" . | nindent 4 }}\nspec:\n  {{- if not .Values.autoscaling.enabled }}\n  replicas: {{ .Values.replicaCount }}\n  {{- end }}\n  template:\n    metadata:\n      {{- with .Values.podAnnotations }}\n      annotations:\n        {{- toYaml . | nindent 8 }}\n      {{- end }}\n    spec:\n      containers:\n        {{- range .Values.containers }}\n        - name: {{ .name }}\n          image: {{ .image | quote }}\n        {{- end }}\n" },
  ];
  const rendered = renderHelmBundle(files, "chart/Chart.yaml", "", "shop");
  const resource = parseAllDocuments(rendered)[0].toJSON();
  assert.equal(resource.metadata.name, "shop-storefront");
  assert.equal(resource.spec.replicas, 3);
  assert.equal(resource.spec.template.metadata.annotations.team, "platform");
  assert.deepEqual(resource.spec.template.spec.containers.map((container) => container.name), ["api", "worker"]);
  assert.equal(resource.spec.template.spec.containers[0].image, "example/api:1");
});
