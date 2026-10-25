import test from "node:test";
import assert from "node:assert/strict";
import { buildKubernetesArchitecturePlan } from "../src/features/kubernetes/ui/kubernetesArchitecturePlanner.js";

const icon = (id, name = id) => ({ id: "k8s:" + id, name });

test("planner proposes only supported semantic relationships for selected intelligent resources", () => {
  const plan = buildKubernetesArchitecturePlan([
    icon("namespace", "Namespace"),
    icon("deployment", "Deployment"),
    icon("service", "Service"),
    icon("pod", "Pod"),
    icon("node", "Node"),
  ]);
  assert.deepEqual(plan.relationships.map(({ sourceName, targetName, relationshipType }) => [sourceName, targetName, relationshipType]), [
    ["Namespace", "Deployment", "contains"],
    ["Namespace", "Service", "contains"],
    ["Namespace", "Pod", "contains"],
    ["Deployment", "Pod", "schedules"],
    ["Service", "Pod", "exposes"],
    ["Pod", "Node", "runs-on"],
  ]);
  assert.equal(plan.diagnostics.some((item) => item.severity === "warning"), false);
});

test("planner flags catalog icons that are not backed by intelligent resource definitions", () => {
  const plan = buildKubernetesArchitecturePlan([icon("ingress", "Ingress"), icon("deployment", "Deployment")]);
  assert.equal(plan.diagnostics.some((item) => item.code === "unsupported-resource" && item.message.includes("Ingress")), true);
  assert.equal(plan.relationships.length, 0);
});

test("planner handles empty or malformed input safely", () => {
  assert.deepEqual(buildKubernetesArchitecturePlan().relationships, []);
  assert.deepEqual(buildKubernetesArchitecturePlan(null).resources, []);
});
