import test from "node:test";
import assert from "node:assert/strict";
import { validateComposeDependencies } from "../server/compose-dependency-validation.mjs";

test("accepts services with no dependencies and valid array dependencies", () => {
  const result = validateComposeDependencies({
    api: { image: "example/api", depends_on: ["db"] },
    db: { image: "postgres:17" },
    worker: { image: "example/worker" },
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.diagnostics, []);
});

test("accepts dependency mappings with Compose condition objects", () => {
  const result = validateComposeDependencies({
    api: { depends_on: { db: { condition: "service_healthy" } } },
    db: { image: "postgres:17" },
  });
  assert.equal(result.valid, true);
});

test("reports missing dependencies with the dependent service and missing name", () => {
  const result = validateComposeDependencies({
    api: { depends_on: ["database"] },
  });
  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((item) =>
    item.code === "COMPOSE_DEPENDENCY_MISSING" &&
    item.serviceName === "api" &&
    item.dependencyName === "database"
  ));
});

test("reports self-dependencies and multi-service dependency cycles", () => {
  const result = validateComposeDependencies({
    api: { depends_on: ["worker"] },
    worker: { depends_on: ["api"] },
    cache: { depends_on: ["cache"] },
  });
  const cycles = result.diagnostics.filter((item) => item.code === "COMPOSE_DEPENDENCY_CYCLE");
  assert.ok(cycles.length >= 2);
  assert.ok(cycles.some((item) => item.message.includes("api") && item.message.includes("worker")));
  assert.ok(cycles.some((item) => item.serviceName === "cache"));
});

test("reports malformed depends_on shapes and service definitions", () => {
  const result = validateComposeDependencies({
    api: { depends_on: "db" },
    broken: null,
  });
  assert.equal(result.valid, false);
  assert.ok(result.diagnostics.some((item) => item.code === "COMPOSE_DEPENDS_ON_INVALID" && item.serviceName === "api"));
  assert.ok(result.diagnostics.some((item) => item.code === "COMPOSE_SERVICE_INVALID" && item.serviceName === "broken"));
});
