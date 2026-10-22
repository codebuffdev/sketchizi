import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { proposeArchitectureFromRequirement } from "../src/features/workbench/requirementArchitectureProposal.js";

const panelSource = await readFile(new URL("../src/features/workbench/WorkbenchPanel.jsx", import.meta.url), "utf8");

test("requirement proposal rejects vague input", () => {
  const result = proposeArchitectureFromRequirement("app");
  assert.equal(result.valid, false);
  assert.equal(result.components.length, 0);
});

test("basic requirement proposes editable client, API and relational data components", () => {
  const result = proposeArchitectureFromRequirement("Build a web app for customers to manage their profiles and orders.");
  assert.equal(result.valid, true);
  assert.deepEqual(result.components.map((item) => item.kind), ["frontend.react-app", "backend.rest-service", "data.postgresql-database"]);
  assert.ok(result.assumptions.length >= 3);
  assert.deepEqual(result.relations.map(({ source, kind, target }) => [source, kind, target]), [
    ["Web application", "calls", "Core API service"],
    ["Core API service", "reads", "Application database"],
  ]);
});

test("event-driven payment requirements surface queue, worker and payment boundary", () => {
  const result = proposeArchitectureFromRequirement("Build checkout and payment confirmation asynchronously, with notifications sent through an event queue.");
  const kinds = result.components.map((item) => item.kind);
  assert.ok(kinds.includes("integrations.external-api"));
  assert.ok(kinds.includes("messaging.queue"));
  assert.ok(kinds.includes("backend.worker"));
  assert.ok(result.assumptions.some((item) => item.includes("idempotency")));
  assert.ok(result.relations.some((item) => item.kind === "publishes" && item.target === "Event queue"));
  assert.ok(result.relations.some((item) => item.kind === "subscribes" && item.source === "Background worker"));
});

test("proposal UI requires review and adds chosen components through the existing model callback", () => {
  assert.match(panelSource, /REQUIREMENT-TO-ARCHITECTURE STUDIO/);
  assert.match(panelSource, /Propose architecture/);
  assert.match(panelSource, /onAddComponent\?\.\(component\.kind\)/);
  assert.match(panelSource, /Assumptions and open decisions/);
  assert.match(panelSource, /Suggested typed relationships/);
  assert.match(panelSource, /architectureProposal\.relations/);
});
