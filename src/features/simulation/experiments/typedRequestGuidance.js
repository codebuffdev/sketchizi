/**
 * Suggest explicit semantic links for the common browser -> API -> database
 * vertical slice. Canvas arrows are deliberately not inspected here: only
 * Workbench relations define the simulation topology.
 */
export function getTypedRequestGuidance(workbench, visibleEntityIds) {
  if (!workbench || !Array.isArray(workbench.entities) || !Array.isArray(workbench.relations)) return null;
  const visible = Array.isArray(visibleEntityIds) ? new Set(visibleEntityIds) : null;
  const selectComponent = (kind) => {
    const all = workbench.entities.filter((entity) => entity.kind === kind);
    const inView = visible ? all.filter((entity) => visible.has(entity.id)) : all;
    if (inView.length === 1) return { entity: inView[0], placed: true };
    if (inView.length > 1) return null;
    // Still explain the intended connection when semantic entities exist in the document
    // but the scene-derived placement list is unavailable or stale. The action is disabled
    // until both endpoints are actually placed in the active view.
    if (all.length === 1) return { entity: all[0], placed: visible ? false : true };
    return null;
  };

  const clientSelection = selectComponent("frontend.react-app");
  const serviceSelection = selectComponent("backend.rest-service");
  const databaseSelection = selectComponent("data.postgresql-database");
  // Avoid guessing between multiple candidate clients/services/databases.
  if (!clientSelection || !serviceSelection || (databaseSelection === null && workbench.entities.some((entity) => entity.kind === "data.postgresql-database"))) return null;
  const client = clientSelection.entity;
  const service = serviceSelection.entity;
  const database = databaseSelection?.entity || null;
  const relations = workbench.relations;

  const endpointsOwnedByService = new Set(relations
    .filter((relation) => relation.kind === "exposes" && relation.sourceId === service.id)
    .map((relation) => relation.targetId));
  const hasCall = relations.some((relation) => relation.kind === "calls"
    && relation.sourceId === client.id
    && (relation.targetId === service.id || endpointsOwnedByService.has(relation.targetId)));
  const hasDatabaseAccess = database && relations.some((relation) =>
    (relation.kind === "reads" || relation.kind === "writes")
    && relation.sourceId === service.id
    && relation.targetId === database.id);

  const isPlaced = (entity) => !visible || visible.has(entity.id);
  const missingLinks = [];
  if (!hasCall) {
    missingLinks.push({
      id: "client-calls-service",
      from: client,
      to: service,
      relationKind: "calls",
      relationLabel: "Calls",
      focusEntityId: client.id,
      canCreate: isPlaced(client) && isPlaced(service),
      title: `${client.name || "React application"} — Calls → ${service.name || "REST service"}`,
      instruction: "Create a typed Calls relationship. This will reuse a bound visual arrow when possible, or draw a new semantic connector.",
    });
  }
  if (database && !hasDatabaseAccess) {
    const canCreate = isPlaced(service) && isPlaced(database);
    missingLinks.push({
      id: "service-accesses-database",
      from: service,
      to: database,
      relationKind: "reads",
      alternativeRelationKind: "writes",
      relationLabel: "Reads from / Writes to",
      focusEntityId: service.id,
      canCreate,
      title: `${service.name || "REST service"} — Reads from / Writes to → ${database.name || "PostgreSQL"}`,
      instruction: "Choose Reads from or Writes to according to the modeled operation. The simulator combines these into one database hop when both are present.",
    });
  }
  if (missingLinks.length === 0) return null;
  return { client, service, database, missingLinks };
}
