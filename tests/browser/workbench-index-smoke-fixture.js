import { createWorkbenchExtension } from "../../src/features/workbench/workbenchDocument.js";
import { generateOpenApiArtifact, generateSqlArtifact } from "../../src/features/workbench/workbenchArtifacts.js";
import { runWorkbenchExperiments } from "../../src/features/simulation/runWorkbenchExperiments.js";
import {
  createDatabaseIndexImprovementProfile,
  createIllustrativeSimulationProfile,
  getCapacityPressureRows,
  markSimulationAssumptionsConfirmed,
} from "../../src/features/simulation/experiments/simulationExperimentModel.js";

/**
 * Shared browser/Node fixture for the query-index release-verification path.
 * It exercises real Workbench, simulation, index-hypothesis, and artifact modules.
 */
export function createIndexHypothesisBrowserSmokeFixture() {
  const workbench = createWorkbenchExtension({
    activeViewId: "system",
    modelRevision: 9,
    entities: [
      { id: "ui-1", kind: "frontend.react-app", name: "Web UI", properties: {} },
      { id: "api-1", kind: "backend.rest-service", name: "API", properties: { port: 8080 } },
      { id: "db-1", kind: "data.postgresql-database", name: "Primary DB", properties: { databaseName: "app_db", schema: "public" } },
      { id: "endpoint-1", kind: "backend.api-endpoint", name: "List items", properties: {
        method: "GET", path: "/api/items", operationId: "listItems", summary: "List items",
        responseSchema: JSON.stringify({ type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } }, required: ["id", "name"] } }),
      } },
      { id: "table-1", kind: "data.postgresql-table", name: "items", properties: {
        tableName: "items",
        columns: JSON.stringify([
          { name: "id", type: "UUID", primaryKey: true, nullable: false },
          { name: "name", type: "TEXT", nullable: false },
          { name: "created_at", type: "TIMESTAMPTZ", nullable: false },
        ]),
        indexes: JSON.stringify([{ name: "idx_items_created_at", columns: ["created_at"], method: "btree", unique: false }]),
      } },
    ],
    relations: [
      { id: "rel-1", kind: "calls", sourceId: "ui-1", targetId: "api-1" },
      { id: "rel-2", kind: "reads", sourceId: "api-1", targetId: "db-1" },
      { id: "rel-3", kind: "exposes", sourceId: "api-1", targetId: "endpoint-1" },
      { id: "rel-4", kind: "contains-table", sourceId: "db-1", targetId: "table-1" },
    ],
    views: [{ id: "system", kind: "system", title: "System" }, { id: "apis", kind: "apis", title: "APIs" }],
    viewScenes: {
      apis: {
        elements: [{ id: "api-placement", type: "rectangle", x: 80, y: 40, width: 120, height: 60, customData: { sketchizi: { workbenchEntityId: "api-1" } } }],
        appState: { scrollX: -4, scrollY: -8, zoom: { value: 1.2 } }, files: {},
      },
    },
  });
  workbench.pocTemplate = { id: "react-rest-postgresql", version: 2 };
  const simulationProfile = markSimulationAssumptionsConfirmed(createIllustrativeSimulationProfile(workbench, { durationMs: 15000, seed: 211 }));
  const originalProfile = structuredClone(simulationProfile);
  const originalModel = structuredClone(workbench);
  const experimentSuite = runWorkbenchExperiments({ workbench, simulationProfile });
  if (experimentSuite.status !== "completed") throw new Error(`Smoke fixture simulation did not complete: ${JSON.stringify(experimentSuite.diagnostics)}`);

  const selectedIndexTable = workbench.entities.find((entity) => entity.id === "table-1");
  const scenarioKey = experimentSuite.runs.trafficSurge ? "trafficSurge" : "baseline";
  const indexScenario = experimentSuite.runs[scenarioKey];
  const indexTrial = createDatabaseIndexImprovementProfile({
    profile: simulationProfile,
    workbench,
    scopeEntityIds: workbench.entities.map((entity) => entity.id),
    componentRows: getCapacityPressureRows(indexScenario),
    preferredEntityId: "db-1",
    preferredTableId: selectedIndexTable.id,
    preferredColumnName: "name",
  });
  const indexTrialSuite = runWorkbenchExperiments({ workbench, simulationProfile: indexTrial.profile });
  if (indexTrialSuite.status !== "completed") throw new Error(`Index hypothesis browser fixture did not complete: ${JSON.stringify(indexTrialSuite.diagnostics)}`);
  const indexAfterRun = indexTrialSuite.runs[scenarioKey];
  const indexAfterDb = indexAfterRun.result.result.perNode.find((row) => row.sourceEntityId === "db-1");
  if (!(indexAfterDb?.indexedReadOperationsStarted > 0 && indexAfterDb?.indexAssumedTimeSavedMsTotal > 0)) {
    throw new Error("Index hypothesis fixture did not produce recorded indexed-read evidence.");
  }
  const sql = generateSqlArtifact(workbench);
  const openApi = generateOpenApiArtifact(workbench);
  if (!sql.ok || !openApi.ok) throw new Error(`Starter artifacts invalid: ${JSON.stringify({ sql: sql.errors, openapi: openApi.errors })}`);
  if (JSON.stringify(simulationProfile) !== JSON.stringify(originalProfile)) throw new Error("Index trial mutated the source profile.");
  if (JSON.stringify(workbench) !== JSON.stringify(originalModel)) throw new Error("Index trial mutated the canonical model.");

  return {
    workbench,
    simulationProfile,
    experimentSuite,
    indexEvidence: {
      scenarioKey,
      candidateSql: indexTrial.proposedIndex.sqlStatement,
      candidateColumn: indexTrial.proposedIndex.columnName,
      beforeFraction: indexTrial.before,
      afterFraction: indexTrial.after,
      indexedReadOperationsStarted: indexAfterDb.indexedReadOperationsStarted,
      indexAssumedTimeSavedMsTotal: indexAfterDb.indexAssumedTimeSavedMsTotal,
      acceptedSchemaSql: sql.text,
      openApiPath: Object.keys(JSON.parse(openApi.text).paths || {})[0],
    },
  };
}
