import test from "node:test";
import assert from "node:assert/strict";
import { buildSystemDesignImplementationPlan, mergeImplementationTaskProgress, renderSystemDesignImplementationPlanMarkdown, updateImplementationTask } from "../src/features/architecture/systemDesignImplementationPlanner.js";

const graph = { nodes: [{ id: "client", name: "Web client", type: "frontend" }, { id: "api", name: "API", type: "service" }, { id: "db", name: "Database", type: "database" }], edges: [{ sourceId: "client", targetId: "api", type: "calls" }, { sourceId: "api", targetId: "db", type: "queries" }] };

test("builds a sequenced implementation plan from graph dependencies", () => {
  const plan = buildSystemDesignImplementationPlan(graph, { generatedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(plan.summary.components, 3);
  assert.equal(plan.summary.connections, 2);
  assert.equal(plan.tasks.length, 3);
  assert.equal(plan.tasks.find((task) => task.componentId === "client").phase, 1);
  assert.equal(plan.tasks.find((task) => task.componentId === "api").phase, 2);
  assert.deepEqual(plan.tasks.find((task) => task.componentId === "db").dependencies, ["api"]);
  assert.equal(plan.summary.dependencyCycles, false);
});

test("detects cycles and ignores malformed or external edges", () => {
  const plan = buildSystemDesignImplementationPlan({ nodes: [{ id: "a" }, { id: "b" }], edges: [{ sourceId: "a", targetId: "b" }, { sourceId: "b", targetId: "a" }, { sourceId: "missing", targetId: "a" }] });
  assert.equal(plan.summary.dependencyCycles, true);
  assert.ok(plan.caveats.some((item) => item.includes("cycle")));
  assert.equal(plan.summary.connections, 2);
});

test("updates only supported task progress fields", () => {
  const plan = buildSystemDesignImplementationPlan(graph);
  const updated = updateImplementationTask(plan, "api", { status: "done", owner: "Platform team", notes: "Ready", priority: "high", effort: "L", unexpected: "ignored" });
  const task = updated.tasks.find((item) => item.componentId === "api");
  assert.equal(task.status, "done");
  assert.equal(task.owner, "Platform team");
  assert.equal(task.unexpected, undefined);
  assert.equal(updated.summary.completionPercent, 33);
  assert.throws(() => updateImplementationTask(plan, "missing", { status: "done" }), /Unknown implementation task/);
});

test("preserves saved task progress when the plan is regenerated", () => {
  const original = buildSystemDesignImplementationPlan(graph);
  const saved = updateImplementationTask(original, "api", { status: "in-progress", owner: "Team A", notes: "Start with auth" });
  const refreshed = mergeImplementationTaskProgress(buildSystemDesignImplementationPlan(graph), saved);
  const task = refreshed.tasks.find((item) => item.componentId === "api");
  assert.equal(task.status, "in-progress");
  assert.equal(task.owner, "Team A");
  assert.equal(task.notes, "Start with auth");
});

test("exports a markdown plan with summary, task criteria, and caveats", () => {
  const markdown = renderSystemDesignImplementationPlanMarkdown(buildSystemDesignImplementationPlan(graph));
  assert.match(markdown, /## Summary/);
  assert.match(markdown, /Implement API/);
  assert.match(markdown, /Acceptance criteria/);
  assert.match(markdown, /Planning caveats/);
});

test("review dashboard includes the implementation planner for the current graph", async () => {
  const fs = await import("node:fs/promises");
  const dashboard = await fs.readFile(new URL("../src/features/architecture/SystemDesignReviewDashboard.jsx", import.meta.url), "utf8");
  assert.match(dashboard, /import SystemDesignImplementationPlanner/);
  assert.match(dashboard, /<SystemDesignImplementationPlanner graph=\{graph\} \/>/);
});
