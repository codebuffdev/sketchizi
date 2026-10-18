/**
 * Derive the effective runtime scope from placements in the active Workbench view.
 * When a traffic source is present in that view, the simulation follows typed
 * runtime links outward from those clients; disconnected runtime components are
 * reported as out of scope instead of being injected into the engine as orphan
 * nodes. If no client is placed in the view, retain the view's components so the
 * validator can explain that a traffic source is required.
 *
 * Views are layout projections of one shared model. This filters a copy for the
 * run only and never mutates or deletes the canonical document data.
 */
const SCOPE_LINK_KINDS = new Set([
  "calls",
  "reads",
  "writes",
  "publishes",
  "subscribes",
  "exposes",
  "deploys-to",
]);

export function deriveSimulationScope(workbench, seedEntityIds) {
  if (!workbench || !Array.isArray(workbench.entities) || !Array.isArray(workbench.relations)) {
    throw new TypeError("A Workbench model with entities and relations is required.");
  }

  // Omitting scopeEntityIds preserves model-wide behavior for CLI/examples and
  // existing API consumers. The UI passes the active-view placements explicitly.
  if (!Array.isArray(seedEntityIds)) {
    const entityIds = workbench.entities.map((entity) => entity.id).filter((id) => typeof id === "string").sort();
    return {
      workbench,
      entityIds,
      seedEntityIds: entityIds,
      rootEntityIds: entityIds,
      viewEntityIds: entityIds,
      excludedEntityIds: [],
      scoped: false,
    };
  }

  const entityById = new Map(workbench.entities.filter((entity) => typeof entity?.id === "string").map((entity) => [entity.id, entity]));
  const adjacency = new Map([...entityById.keys()].map((id) => [id, new Set()]));
  for (const relation of workbench.relations) {
    if (!SCOPE_LINK_KINDS.has(relation?.kind)) continue;
    if (!entityById.has(relation.sourceId) || !entityById.has(relation.targetId)) continue;
    adjacency.get(relation.sourceId).add(relation.targetId);
    adjacency.get(relation.targetId).add(relation.sourceId);
  }

  const viewSeeds = [...new Set(seedEntityIds)].filter((id) => entityById.has(id)).sort();
  const trafficSourceSeeds = viewSeeds.filter((id) => entityById.get(id)?.kind === "frontend.react-app");
  // The main simulation is request/traffic oriented. If the current view has
  // one or more clients, only their typed-connected paths belong in this run.
  // That stops a disconnected/off-canvas External API from blocking a valid flow.
  const rootEntityIds = trafficSourceSeeds.length ? trafficSourceSeeds : viewSeeds;
  const included = new Set(rootEntityIds);
  const pending = [...rootEntityIds];
  while (pending.length) {
    const current = pending.shift();
    for (const connectedId of adjacency.get(current) || []) {
      if (included.has(connectedId)) continue;
      included.add(connectedId);
      pending.push(connectedId);
    }
  }

  const entityIds = [...included].sort();
  const scopedWorkbench = {
    ...workbench,
    entities: workbench.entities.filter((entity) => included.has(entity.id)),
    relations: workbench.relations.filter((relation) => included.has(relation.sourceId) && included.has(relation.targetId)),
  };
  return {
    workbench: scopedWorkbench,
    entityIds,
    seedEntityIds: viewSeeds,
    rootEntityIds: [...rootEntityIds].sort(),
    viewEntityIds: viewSeeds,
    excludedEntityIds: workbench.entities.map((entity) => entity.id).filter((id) => !included.has(id)).sort(),
    scoped: true,
  };
}
