import test from "node:test";
import assert from "node:assert/strict";
import { validateWorkbench } from "../src/features/workbench/workbenchValidation.js";

const entity = (id, kind, properties = {}) => ({ id, kind, name: id, properties });
const relation = (id, kind, sourceId, targetId) => ({ id, kind, sourceId, targetId, viewIds: ["system"], properties: {} });
const model = (entities = [], relations = []) => ({ entities, relations });
const codes = (findings) => findings.map((finding) => finding.code);

test("empty or absent model produces no architecture claims", () => {
  assert.deepEqual(validateWorkbench(null), []);
  assert.deepEqual(validateWorkbench(model()), []);
});

test("REST service without a deployment target produces an actionable warning", () => {
  const findings = validateWorkbench(model([entity("svc", "backend.rest-service")]));
  const finding = findings.find((item) => item.code === "service.no-deployment");
  assert.equal(finding.severity, "warning");
  assert.deepEqual(finding.entityIds, ["svc"]);
  assert.match(finding.message, /No Deploys to relationship/);
  assert.ok(finding.suggestedAction);
});

test("endpoint must be associated with an exposing service", () => {
  const findings = validateWorkbench(model([entity("ep", "backend.api-endpoint", { method: "GET", path: "/v1/items" })]));
  assert.ok(codes(findings).includes("api-endpoint.unexposed"));
});

test("correct endpoint exposure suppresses endpoint warning", () => {
  const entities = [entity("svc", "backend.rest-service"), entity("ep", "backend.api-endpoint", { method: "GET", path: "/v1/items" })];
  const findings = validateWorkbench(model(entities, [relation("r1", "exposes", "svc", "ep")]));
  assert.ok(!codes(findings).includes("api-endpoint.unexposed"));
  assert.ok(!codes(findings).includes("relation.invalid-endpoints"));
});

test("worker and queue findings are suppressed when a valid subscription exists", () => {
  const entities = [entity("worker", "backend.worker"), entity("queue", "messaging.queue")];
  const findings = validateWorkbench(model(entities, [relation("r1", "subscribes", "worker", "queue")]));
  assert.ok(!codes(findings).includes("worker.no-subscription"));
  assert.ok(!codes(findings).includes("queue.no-consumer"));
});

test("dangling and invalid typed relationships are errors", () => {
  const entities = [entity("ui", "frontend.react-app"), entity("db", "data.postgresql-database")];
  const findings = validateWorkbench(model(entities, [relation("r1", "reads", "ui", "db"), relation("r2", "calls", "ui", "missing")]));
  assert.ok(findings.some((item) => item.code === "relation.invalid-endpoints" && item.severity === "error"));
  assert.ok(findings.some((item) => item.code === "relation.dangling-endpoint" && item.severity === "error"));
});

test("duplicate API methods and paths are identified deterministically", () => {
  const entities = [entity("ep1", "backend.api-endpoint", { method: "GET", path: "/items" }), entity("ep2", "backend.api-endpoint", { method: "get", path: "/items" })];
  const first = validateWorkbench(model(entities));
  const second = validateWorkbench(model(entities));
  assert.ok(codes(first).includes("api-endpoint.duplicate-operation"));
  assert.deepEqual(first, second);
});

test("duplicate relation and duplicate entity IDs are reported", () => {
  const svc = entity("svc", "backend.rest-service");
  const ep = entity("ep", "backend.api-endpoint");
  const findings = validateWorkbench(model([svc, svc, ep], [relation("r1", "exposes", "svc", "ep"), relation("r2", "exposes", "svc", "ep")]));
  assert.ok(codes(findings).includes("entity.duplicate-id"));
  assert.ok(codes(findings).includes("relation.duplicate"));
});
