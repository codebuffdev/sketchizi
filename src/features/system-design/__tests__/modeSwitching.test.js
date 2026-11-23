import test from "node:test";
import assert from "node:assert/strict";
import { STUDIO_MODES, composeYaml, kubernetesYaml, modeBadge, serviceNames, studioYaml, slugify } from "../yamlPreview.js";
import { createNodeMeta } from "../primitives.js";

const n = (id, kind, extra = {}) => ({ id, ...createNodeMeta(kind), ...extra });

test("three studio modes in order", () => {
  assert.deepEqual(STUDIO_MODES.map((m) => m.id), ["canvas", "k8s", "compose"]);
  assert.deepEqual(STUDIO_MODES.map((m) => m.label), ["Canvas", "K8s Studio", "Compose"]);
});

test("badges switch per mode: subtitle, pods, port", () => {
  const svc = n("a", "microservice");
  assert.equal(modeBadge(svc, "canvas"), "Business logic");
  assert.equal(modeBadge(svc, "k8s"), "3/3 pods");
  assert.equal(modeBadge(svc, "compose"), ":8080");
  assert.equal(modeBadge({ ...svc, health: "degraded" }, "k8s"), "2/3 pods");
  assert.equal(modeBadge({ ...svc, health: "down" }, "k8s"), "0/3 pods");
  assert.equal(modeBadge(n("c", "client"), "compose"), "external");
});

test("YAML reflects replicas, image and port edits live", () => {
  const nodes = [n("a", "microservice", { label: "Orders API", replicas: 5, port: 9000 })];
  assert.match(kubernetesYaml(nodes), /name: orders-api[\s\S]*replicas: 5[\s\S]*containerPort: 9000/);
  const compose = composeYaml(nodes);
  assert.match(compose, /^services:\n  orders-api:\n    image: ghcr\.io\/acme\/service:latest/);
  assert.match(compose, /"9000:9000"/);
  assert.match(compose, /replicas: 5/);
  assert.equal(studioYaml("canvas", nodes), "");
  assert.equal(studioYaml("k8s", nodes), kubernetesYaml(nodes));
});

test("compose depends_on follows edges and external nodes are excluded", () => {
  const nodes = [n("c", "client"), n("a", "microservice", { label: "API" }), n("d", "sql", { label: "DB" })];
  const yaml = composeYaml(nodes, [{ id: "1", from: "a", to: "d" }, { id: "2", from: "c", to: "a" }]);
  assert.match(yaml, /api:[\s\S]*depends_on:\n      - db/);
  assert.ok(!yaml.includes("web-mobile-client"));
});

test("duplicate labels get unique service names; empty scenes explain themselves", () => {
  const names = serviceNames([n("1", "microservice", { label: "API" }), n("2", "microservice", { label: "API" })]);
  assert.deepEqual([...names.values()], ["api", "api-2"]);
  assert.equal(slugify("  !!  "), "service");
  assert.match(kubernetesYaml([]), /^#/);
});
