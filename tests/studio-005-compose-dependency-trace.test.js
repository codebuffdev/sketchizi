import test from "node:test";
import assert from "node:assert/strict";
import { traceComposeDependencies } from "../src/features/docker-compose/composeDependencyTrace.js";

test("traces declared Compose dependencies deterministically", () => {
  const document = { services: { web: { depends_on: ["api"] }, api: { depends_on: { db: { condition: "service_started" } } }, db: {} } };
  const result = traceComposeDependencies(document, "web");
  assert.deepEqual(result.steps.map(({ from, to }) => from + ">" + to), ["web>api", "api>db"]);
  assert.deepEqual(result.warnings, []);
});
test("reports cycles and missing dependencies without looping", () => {
  const result = traceComposeDependencies({ services: { a: { depends_on: ["b", "missing"] }, b: { depends_on: ["a"] } } }, "a");
  assert.equal(result.steps.length, 3);
  assert.ok(result.warnings.some((warning) => warning.includes("cycle")));
  assert.ok(result.warnings.some((warning) => warning.includes("missing")));
});
test("rejects invalid inputs", () => {
  assert.throws(() => traceComposeDependencies({}, "web"), /services mapping/);
  assert.throws(() => traceComposeDependencies({ services: {} }, "web"), /Unknown starting service/);
});
