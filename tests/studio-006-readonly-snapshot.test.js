import test from "node:test";
import assert from "node:assert/strict";
import { summarizeKubernetesSnapshot } from "../src/features/kubernetes-studio/readOnlySnapshot.js";

test("extracts only minimal status fields from supplied Kubernetes resources", () => {
  const input = [{ kind: "Pod", metadata: { name: "api", namespace: "dev", annotations: { secret: "do-not-copy" } }, status: { phase: "Running" }, spec: { containers: [{ env: [{ name: "TOKEN", value: "secret" }] }] } }, { kind: "Deployment", metadata: { name: "web" }, spec: { replicas: 3 }, status: { readyReplicas: 2 } }];
  const original = structuredClone(input);
  assert.deepEqual(summarizeKubernetesSnapshot(input), [{ kind: "Pod", name: "api", namespace: "dev", phase: "Running" }, { kind: "Deployment", name: "web", namespace: "default", desired: 3, ready: 2 }]);
  assert.deepEqual(input, original);
});
test("ignores unknown and malformed resources", () => {
  assert.deepEqual(summarizeKubernetesSnapshot([{ kind: "Secret", metadata: { name: "token" } }, { kind: "Pod" }, null]), []);
  assert.throws(() => summarizeKubernetesSnapshot({}), /resource list/);
});
