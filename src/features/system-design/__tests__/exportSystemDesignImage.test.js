import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemDesignSvg } from "../exportSystemDesignImage.js";

const nodes = [
  { id: "api", kind: "microservice", label: "Orders API", x: 40, y: 60, width: 280, height: 140, accent: "blue", protocol: "HTTPS", replicas: 2, capacityPerReplica: 1000, manualRps: 450 },
  { id: "db", kind: "sql", label: "Orders Database", x: 440, y: 60, width: 280, height: 140, accent: "green", protocol: "TCP" },
];
const edges = [{ id: "api-db", from: "api", to: "db", fromPort: "right", toPort: "left", protocol: "HTTPS" }];
const simulation = { nodes: {
  api: { incomingRps: 450, p95Ms: 28, utilization: 0.45, status: "healthy" },
  db: { incomingRps: 450, p95Ms: 16, utilization: 0.7, status: "elevated" },
} };

test("exports non-empty, tightly bounded SVG with node labels, telemetry and orthogonal connectors in both themes", () => {
  for (const darkMode of [false, true]) {
    const svg = buildSystemDesignSvg({ nodes, edges, simulation, darkMode, background: darkMode ? "dark" : "light" });
    assert.match(svg, /<svg[^>]+width="728"[^>]+height="188"/);
    assert.match(svg, /Orders API/);
    assert.match(svg, /Orders Database/);
    assert.match(svg, /450/);
    assert.match(svg, /28ms/);
    assert.match(svg, /70%/);
    assert.match(svg, /<path[^>]+d="M/);
    assert.match(svg, /HTTPS/);
    assert.match(svg, new RegExp(darkMode ? "#12141c" : "#ffffff"));
  }
});

test("returns an empty string for a tab without System Design nodes", () => {
  assert.equal(buildSystemDesignSvg({ nodes: [], edges: [] }), "");
});
