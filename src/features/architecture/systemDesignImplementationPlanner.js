const TASK_STATUSES = new Set(["planned", "in-progress", "blocked", "done"]);
const EFFORTS = new Set(["S", "M", "L"]);

function cleanText(value, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, 240) : fallback;
}

function normalizeGraph(graph = {}) {
  const rawNodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const seen = new Set();
  const nodes = rawNodes.filter((node) => node && typeof node.id === "string" && node.id.trim() && !seen.has(node.id) && seen.add(node.id)).map((node) => ({
    id: node.id,
    name: cleanText(node.name, node.id) || node.id,
    type: cleanText(node.type, "component") || "component",
    role: cleanText(node.role),
  }));
  const ids = new Set(nodes.map((node) => node.id));
  const edges = (Array.isArray(graph.edges) ? graph.edges : []).filter((edge) => edge && ids.has(edge.sourceId) && ids.has(edge.targetId) && edge.sourceId !== edge.targetId).map((edge) => ({ sourceId: edge.sourceId, targetId: edge.targetId, type: cleanText(edge.type, "depends-on") || "depends-on" }));
  return { nodes, edges };
}

function orderGraph(nodes, edges) {
  const incoming = new Map(nodes.map((node) => [node.id, 0]));
  const outgoing = new Map(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    incoming.set(edge.targetId, incoming.get(edge.targetId) + 1);
    outgoing.get(edge.sourceId).push(edge.targetId);
  }
  const ready = nodes.filter((node) => incoming.get(node.id) === 0).map((node) => node.id);
  const depth = new Map(ready.map((id) => [id, 0]));
  const order = [];
  while (ready.length) {
    ready.sort((a, b) => nodes.findIndex((node) => node.id === a) - nodes.findIndex((node) => node.id === b));
    const id = ready.shift();
    order.push(id);
    for (const target of outgoing.get(id)) {
      depth.set(target, Math.max(depth.get(target) || 0, (depth.get(id) || 0) + 1));
      incoming.set(target, incoming.get(target) - 1);
      if (incoming.get(target) === 0) ready.push(target);
    }
  }
  const cycleIds = nodes.map((node) => node.id).filter((id) => !order.includes(id));
  for (const id of cycleIds) {
    order.push(id);
    depth.set(id, Math.max(0, ...edges.filter((edge) => edge.targetId === id).map((edge) => depth.get(edge.sourceId) || 0)));
  }
  return { order, depth, cycleDetected: cycleIds.length > 0 };
}

export function buildSystemDesignImplementationPlan(graph, options = {}) {
  const normalized = normalizeGraph(graph);
  const { nodes, edges } = normalized;
  const { order, depth, cycleDetected } = orderGraph(nodes, edges);
  const incoming = new Map(nodes.map((node) => [node.id, edges.filter((edge) => edge.targetId === node.id)]));
  const outgoing = new Map(nodes.map((node) => [node.id, edges.filter((edge) => edge.sourceId === node.id)]));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const tasks = order.map((id, index) => {
    const node = byId.get(id);
    const dependencies = incoming.get(id).map((edge) => edge.sourceId);
    const connections = incoming.get(id).length + outgoing.get(id).length;
    const role = `${node.role} ${node.type} ${node.name}`.toLowerCase();
    const effort = connections >= 4 || /database|security|gateway|cluster|network|queue|identity/.test(role) ? "L" : connections >= 2 ? "M" : "S";
    const priority = /gateway|identity|network|database|security|cluster/.test(role) ? "high" : connections >= 3 ? "high" : dependencies.length === 0 ? "medium" : "medium";
    return {
      id: `implement-${id}`,
      componentId: id,
      title: `Implement ${node.name}`,
      componentType: node.type,
      phase: (depth.get(id) || 0) + 1,
      sequence: index + 1,
      dependencies,
      acceptanceCriteria: `Deploy and configure ${node.name}; verify health, access controls, observability, and documented operational ownership.`,
      effort,
      priority,
      status: "planned",
      owner: "",
      notes: "",
    };
  });
  return {
    schemaVersion: 1,
    title: cleanText(options.title, "Architecture implementation plan") || "Architecture implementation plan",
    generatedAt: options.generatedAt || new Date().toISOString(),
    summary: { components: nodes.length, connections: edges.length, tasks: tasks.length, phases: tasks.reduce((max, task) => Math.max(max, task.phase), 0), dependencyCycles: cycleDetected },
    caveats: ["Task order is inferred from diagram connections and is a planning aid, not a deployment guarantee.", "Effort and priority are heuristic defaults and should be reviewed by the delivery team.", "A dependency cycle was detected; tasks in that cycle require manual sequencing."].filter((item) => item.includes("dependency cycle") ? cycleDetected : true),
    tasks,
  };
}

export function mergeImplementationTaskProgress(generatedPlan, savedPlan) {
  if (!generatedPlan || !Array.isArray(generatedPlan.tasks)) return generatedPlan;
  const savedTasks = new Map((Array.isArray(savedPlan?.tasks) ? savedPlan.tasks : []).map((task) => [task.componentId, task]));
  return { ...generatedPlan, tasks: generatedPlan.tasks.map((task) => {
    const saved = savedTasks.get(task.componentId);
    return saved ? { ...task, status: TASK_STATUSES.has(saved.status) ? saved.status : task.status, owner: cleanText(saved.owner), notes: cleanText(saved.notes), effort: EFFORTS.has(saved.effort) ? saved.effort : task.effort, priority: ["low", "medium", "high"].includes(saved.priority) ? saved.priority : task.priority, acceptanceCriteria: cleanText(saved.acceptanceCriteria, task.acceptanceCriteria) || task.acceptanceCriteria } : task;
  }) };
}

export function updateImplementationTask(plan, componentId, patch = {}) {
  if (!plan || !Array.isArray(plan.tasks)) throw new TypeError("A valid implementation plan is required.");
  const allowed = {};
  if (TASK_STATUSES.has(patch.status)) allowed.status = patch.status;
  if (EFFORTS.has(patch.effort)) allowed.effort = patch.effort;
  if (["low", "medium", "high"].includes(patch.priority)) allowed.priority = patch.priority;
  if (typeof patch.owner === "string") allowed.owner = patch.owner.trim().slice(0, 120);
  if (typeof patch.notes === "string") allowed.notes = patch.notes.trim().slice(0, 2000);
  if (typeof patch.acceptanceCriteria === "string") allowed.acceptanceCriteria = patch.acceptanceCriteria.trim().slice(0, 1000);
  let found = false;
  const tasks = plan.tasks.map((task) => {
    if (task.componentId !== componentId) return task;
    found = true;
    return { ...task, ...allowed };
  });
  if (!found) throw new Error(`Unknown implementation task: ${componentId}`);
  const done = tasks.filter((task) => task.status === "done").length;
  return { ...plan, tasks, summary: { ...plan.summary, completedTasks: done, completionPercent: tasks.length ? Math.round(done / tasks.length * 100) : 0 } };
}

export function renderSystemDesignImplementationPlanMarkdown(plan) {
  if (!plan || !Array.isArray(plan.tasks)) throw new TypeError("A valid implementation plan is required.");
  const lines = [`# ${plan.title}`, "", `Generated: ${plan.generatedAt}`, "", "## Summary", "", `- Components: ${plan.summary.components}`, `- Connections: ${plan.summary.connections}`, `- Tasks: ${plan.summary.tasks}`, `- Suggested phases: ${plan.summary.phases}`, `- Dependency cycles: ${plan.summary.dependencyCycles ? "Detected" : "None detected"}`, "", "## Implementation tasks", ""];
  for (const task of plan.tasks) {
    lines.push(`### ${task.sequence}. ${task.title}`, "", `- Phase: ${task.phase}`, `- Status: ${task.status}`, `- Priority: ${task.priority}`, `- Effort: ${task.effort}`, `- Owner: ${task.owner || "Unassigned"}`, `- Depends on: ${task.dependencies.length ? task.dependencies.join(", ") : "None"}`, "", `Acceptance criteria: ${task.acceptanceCriteria}`, task.notes ? `\nNotes: ${task.notes}` : "", "");
  }
  lines.push("## Planning caveats", "", ...plan.caveats.map((item) => `- ${item}`));
  return lines.join("\n");
}
