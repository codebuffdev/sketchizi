import { buildSimulationProjection } from "./adapter/buildSimulationProjection.js";
import { runSimulation, SIMULATION_ENGINE_VERSION } from "./engine/runSimulation.js";
import { explainSimulationRun } from "./experiments/simulationExperimentModel.js";

/**
 * The single orchestration path used by the Workbench UI and automated tests.
 * Sketchizi's engineering model remains canonical; this service compiles it to
 * engine-neutral SimIR, then runs only scenarios supported by the current engine.
 *
 * Results are synthetic model outputs, never live-system measurements.
 */
export const WORKBENCH_SIMULATION_RUNNER_VERSION = "0.1.0";

const RUNTIME_CANDIDATE_KINDS = [
  "data.postgresql-database",
  "backend.rest-service",
  "integrations.external-api",
];

function chooseOutageTarget(workbench, projection, requestedId) {
  if (requestedId) {
    const entity = (workbench.entities || []).find((item) => item.id === requestedId);
    if (!entity || !projection.nodeMap?.[requestedId]) return null;
    return entity;
  }
  for (const kind of RUNTIME_CANDIDATE_KINDS) {
    const entity = (workbench.entities || []).find((item) => item.kind === kind && projection.nodeMap?.[item.id]);
    if (entity) return entity;
  }
  return null;
}

function addRunnerDiagnostic(diagnostics, code, title, message, entityIds = []) {
  diagnostics.push({ code, severity: "warning", title, message, entityIds, relationIds: [] });
}

/**
 * Compile one Workbench model and run a comparable baseline, traffic-surge and
 * optional component-outage experiment set. Output fields are stable for UI use.
 */
export function runWorkbenchExperiments({
  workbench,
  simulationProfile,
  trafficMultiplier = 5,
  outageTargetEntityId,
  limits,
  scopeEntityIds,
} = {}) {
  const projection = buildSimulationProjection({ workbench, simulationProfile, scopeEntityIds });
  const diagnostics = [...(projection.diagnostics || [])];
  const provenance = {
    runnerVersion: WORKBENCH_SIMULATION_RUNNER_VERSION,
    modelRevision: workbench?.modelRevision ?? null,
    modelFingerprint: projection.provenance?.sourceModelFingerprint || null,
    profileFingerprint: projection.provenance?.simulationProfileFingerprint || null,
    scopeEntityIds: projection.provenance?.scopeEntityIds || null,
    scopeSeedEntityIds: projection.provenance?.scopeSeedEntityIds || null,
    scopeRootEntityIds: projection.provenance?.scopeRootEntityIds || null,
    scopeViewEntityIds: projection.provenance?.scopeViewEntityIds || null,
    scoped: projection.provenance?.scoped === true,
    adapterVersion: projection.provenance?.adapterVersion || "unknown",
    engineVersion: SIMULATION_ENGINE_VERSION,
  };
  if (projection.status !== "ready") {
    return { status: "blocked", projection, diagnostics, provenance, profileUsed: simulationProfile, runs: {} };
  }
  if (typeof trafficMultiplier !== "number" || !Number.isFinite(trafficMultiplier) || trafficMultiplier <= 0 || trafficMultiplier === 1) {
    addRunnerDiagnostic(diagnostics, "RUNNER-TRAFFIC-MULTIPLIER-INVALID", "Invalid traffic-surge multiplier", "trafficMultiplier must be finite, greater than zero, and different from 1.");
    return { status: "blocked", projection, diagnostics, provenance, profileUsed: simulationProfile, runs: {} };
  }

  const runs = {
    baseline: {
      key: "baseline",
      label: "Baseline",
      overrides: {},
      result: runSimulation({ projection, limits }),
    },
    trafficSurge: {
      key: "trafficSurge",
      label: `${trafficMultiplier}× traffic`,
      overrides: { trafficMultiplier },
      result: runSimulation({ projection, scenarioOverrides: { trafficMultiplier }, limits }),
    },
  };

  const outageTarget = chooseOutageTarget(workbench, projection, outageTargetEntityId);
  if (outageTarget) {
    const overrides = { unavailableNodeIds: [outageTarget.id] };
    runs.outage = {
      key: "outage",
      label: `${outageTarget.name || outageTarget.id} unavailable`,
      targetEntityId: outageTarget.id,
      overrides,
      result: runSimulation({ projection, scenarioOverrides: overrides, limits }),
    };
  } else if (outageTargetEntityId) {
    addRunnerDiagnostic(
      diagnostics,
      "RUNNER-OUTAGE-TARGET-UNSUPPORTED",
      "Outage target is not simulatable",
      `Component '${outageTargetEntityId}' is missing or does not map to a supported runtime node. No outage run was generated.`,
      [outageTargetEntityId],
    );
  } else {
    const candidateEntities = (workbench?.entities || []).filter((entity) => RUNTIME_CANDIDATE_KINDS.includes(entity.kind));
    const excludedCandidates = candidateEntities.filter((entity) => !projection.nodeMap?.[entity.id]);
    if (excludedCandidates.length) {
      const names = excludedCandidates.map((entity) => entity.name || entity.id);
      const clients = (workbench?.entities || []).filter((entity) => entity.kind === "frontend.react-app");
      diagnostics.push({
        code: "RUNNER-OUTAGE-TARGET-OUTSIDE-TYPED-PATH",
        severity: "warning",
        title: "Runtime components are outside the typed request path",
        message: `${names.join(", ")} ${names.length === 1 ? "is" : "are"} in the engineering model but not in this run's compiled request path. Ordinary canvas arrows are visual only. Create a Calls relationship from React application to REST service, then Reads from or Writes to from the REST service to PostgreSQL.`,
        entityIds: [...new Set([...clients.map((entity) => entity.id), ...excludedCandidates.map((entity) => entity.id)])],
        relationIds: [],
      });
    } else {
      addRunnerDiagnostic(
        diagnostics,
        "RUNNER-OUTAGE-TARGET-MISSING",
        "No outage target available",
        "The model has no supported database, REST service, or external-service node to use for the default outage experiment.",
      );
    }
  }

  for (const run of Object.values(runs)) {
    if (run.result?.status === "completed") {
      run.explanations = explainSimulationRun(run.result, workbench, { scenarioLabel: run.label });
      run.provenance = run.result.provenance || {};
    } else {
      run.explanations = [];
      run.provenance = run.result?.provenance || {};
    }
  }

  // Give users a Workbench-level explanation when the React traffic source has
  // no typed outgoing request route. The lower-level engine error remains in the
  // report, but this message explains that visual Excalidraw arrows are not SimIR edges.
  const trafficSource = (projection.topology?.nodes || []).find((node) => node.kind === "traffic-source");
  const hasRequestRoute = trafficSource && (projection.topology?.edges || []).some((edge) => edge.kind === "request" && edge.sourceId === trafficSource.id);
  if (trafficSource && !hasRequestRoute) {
    const otherRuntimeEntities = (workbench?.entities || []).filter((entity) => entity.id !== trafficSource.sourceEntityId
      && ["backend.rest-service", "data.postgresql-database", "integrations.external-api"].includes(entity.kind));
    diagnostics.push({
      code: "RUNNER-TYPED-REQUEST-PATH-MISSING",
      severity: "blocker",
      title: "No typed request path from the React application",
      message: "Simulation follows Workbench typed relationships, not ordinary canvas arrows. In Inspector, create Calls from the React application to the REST service, then Reads from or Writes to from the REST service to PostgreSQL. Reconfirm the profile after the active simulation scope changes.",
      entityIds: [...new Set([trafficSource.sourceEntityId, ...otherRuntimeEntities.map((entity) => entity.id)])],
      relationIds: [],
    });
  }

  // Projection warnings are useful context, but a scenario may still fail inside
  // the engine (for example because visible runtime nodes are not connected by
  // typed Workbench relationships). Surface those blocking diagnostics at the
  // suite level so the UI never blames an unrelated warning for the failure.
  const diagnosticKeys = new Set(diagnostics.map((item) => `${item.code || "unknown"}|${item.message || ""}|${(item.entityIds || []).join(",")}`));
  const entityIdByRuntimeNodeId = new Map((projection.topology?.nodes || []).map((node) => [node.id, node.sourceEntityId]));
  for (const run of Object.values(runs)) {
    for (const item of run.result?.diagnostics || []) {
      const mappedEntityIds = [...new Set([
        ...(item.entityIds || []),
        ...(item.nodeIds || []).map((nodeId) => entityIdByRuntimeNodeId.get(nodeId)).filter(Boolean),
      ])];
      const surfaced = mappedEntityIds.length ? { ...item, entityIds: mappedEntityIds } : item;
      const key = `${surfaced.code || "unknown"}|${surfaced.message || ""}|${(surfaced.entityIds || []).join(",")}`;
      if (diagnosticKeys.has(key)) continue;
      diagnostics.push(surfaced);
      diagnosticKeys.add(key);
    }
  }
  const severityRank = { blocker: 0, warning: 1, info: 2 };
  diagnostics.sort((a, b) => (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9) || String(a.code).localeCompare(String(b.code)) || String(a.message).localeCompare(String(b.message)));

  const allCompleted = Object.values(runs).every((run) => run.result?.status === "completed");
  const anyCompleted = Object.values(runs).some((run) => run.result?.status === "completed");
  const status = allCompleted && runs.outage ? "completed" : anyCompleted ? "partial" : "blocked";
  return {
    status,
    projection,
    diagnostics,
    provenance,
    profileUsed: simulationProfile,
    runs,
    outageTargetId: outageTarget?.id || null,
    scenarioKeys: Object.keys(runs),
  };
}
