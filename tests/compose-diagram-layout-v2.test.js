import test from "node:test";
import assert from "node:assert/strict";
import { planComposeDiagram, composeCardDetails } from "../src/features/docker-compose/composeDiagramLayout.js";

const compose = {
  services: {
    web: { image: "nginx:1.27", ports: ["8080:80"], depends_on: { api: { condition: "service_healthy" } }, networks: ["frontend"] },
    api: { build: { context: "./api" }, depends_on: ["database"], networks: ["frontend", "backend"], environment: { NODE_ENV: "production" } },
    database: { image: "postgres:17", networks: ["backend"], volumes: ["database-data:/var/lib/postgresql/data"] }
  },
  networks: { frontend: {}, backend: {} },
  volumes: { "database-data": {} }
};
test("dependency arrows follow web to api to database from left to right", () => {
  const plan = planComposeDiagram(compose);
  assert.ok(plan.positions.get("web").x < plan.positions.get("api").x);
  assert.ok(plan.positions.get("api").x < plan.positions.get("database").x);
  assert.deepEqual(plan.edges, [{ from: "web", to: "api" }, { from: "api", to: "database" }]);
});
test("networks and named volumes record actual service membership", () => {
  const plan = planComposeDiagram(compose);
  assert.deepEqual(plan.resources.find((item) => item.name === "frontend").members, ["web", "api"]);
  assert.deepEqual(plan.resources.find((item) => item.name === "backend").members, ["api", "database"]);
  assert.deepEqual(plan.resources.find((item) => item.name === "database-data").members, ["database"]);
});
test("long environment details are summarized, not exposed or overflowing", () => {
  const details = composeCardDetails({ image: "registry.example.com/very/very/very/long/image-name:production", environment: { SECRET_TOKEN: "do-not-render" } });
  assert.ok(details.every((line) => line.length <= 37));
  assert.ok(!details.join(" ").includes("do-not-render"));
});
test("cycles and absent dependencies do not crash layout", () => {
  const plan = planComposeDiagram({ services: { a: { depends_on: ["b", "missing"] }, b: { depends_on: ["a"] } } });
  assert.equal(plan.positions.size, 2);
  assert.equal(plan.edges.length, 2);
});
