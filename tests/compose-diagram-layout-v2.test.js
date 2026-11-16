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

test("resource nodes are positioned close to members and inside project bounds", () => {
  const plan = planComposeDiagram(compose);
  for (const resource of plan.resources) {
    const pos = plan.resourcePositions.get(resource.kind + ":" + resource.name);
    assert.ok(pos && pos.y >= plan.top + plan.cardHeight);
    assert.ok(pos.x + plan.resourceWidth <= plan.left + plan.width);
    assert.ok(pos.y + plan.resourceHeight <= plan.top + plan.height);
  }
});
test("generator uses explicit foreground text rather than theme-dependent shape labels", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  assert.match(source, /type: "text", x, y, text, fontSize, fontFamily: 2, strokeColor: color/);
  assert.match(source, /resource\.members\.forEach\(\(member\)/);
});

test("project boundary has safe clearance below every resource", () => {
  const plan = planComposeDiagram(compose);
  const boundaryBottom = plan.top - 90 + plan.height;
  for (const resource of plan.resources) {
    const pos = plan.resourcePositions.get(resource.kind + ":" + resource.name);
    assert.ok(pos.y + plan.resourceHeight + 20 < boundaryBottom);
  }
});
test("card geometry is compact and storage has its own lower row", () => {
  const plan = planComposeDiagram(compose);
  assert.ok(plan.cardHeight <= 120);
  assert.ok(plan.resourcePositions.get("VOLUME:database-data").y > plan.resourcePositions.get("NETWORK:backend").y);
});
test("dark theme palette compensation is applied before converting canvas elements", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const inversion = source.indexOf('api.getAppState?.().theme === "dark"');
  const conversion = source.indexOf("convertToExcalidrawElements(skeleton)", inversion);
  assert.ok(inversion > 0 && conversion > inversion);
  assert.match(source, /element\.backgroundColor = invertHex\(element\.backgroundColor\)/);
});
