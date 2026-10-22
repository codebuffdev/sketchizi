import test from "node:test";
import assert from "node:assert/strict";
import { generateOpenApiArtifact, generateSqlArtifact } from "../src/features/workbench/workbenchArtifacts.js";
import { readFile } from "node:fs/promises";
import { WORKBENCH_COMPONENTS, WORKBENCH_RELATIONS } from "../src/features/workbench/workbenchRegistry.js";

const entity = (id, kind, name, properties = {}) => ({ id, kind, name, properties });
const relation = (id, kind, sourceId, targetId) => ({ id, kind, sourceId, targetId, viewIds: ["system"], properties: {} });

function apiModel() {
  return {
    modelRevision: 7,
    entities: [
      entity("api", "backend.rest-service", "Accounts service", { basePath: "/api", apiVersion: "2.1.0" }),
      entity("get-account", "backend.api-endpoint", "Get account", {
        method: "GET", path: "/accounts/{accountId}", operationId: "getAccount", summary: "Get an account",
        responseSchema: JSON.stringify({ type: "object", properties: { id: { type: "string" }, email: { type: "string", format: "email" } }, required: ["id"] }),
      }),
      entity("create-account", "backend.api-endpoint", "Create account", {
        method: "POST", path: "/accounts", operationId: "createAccount", summary: "Create an account",
        requestSchema: JSON.stringify({ type: "object", properties: { email: { type: "string", format: "email" } }, required: ["email"] }),
        responseSchema: JSON.stringify({ type: "object", properties: { id: { type: "string" } }, required: ["id"] }),
      }),
    ],
    relations: [relation("expose-get", "exposes", "api", "get-account"), relation("expose-create", "exposes", "api", "create-account")],
  };
}

function sqlModel() {
  return {
    modelRevision: 11,
    entities: [
      entity("db", "data.postgresql-database", "PostgreSQL", { databaseName: "accounts", schema: "app" }),
      entity("accounts-table", "data.postgresql-table", "Accounts table", {
        tableName: "accounts",
        columns: JSON.stringify([
          { name: "id", type: "UUID", primaryKey: true, nullable: false },
          { name: "email", type: "VARCHAR(320)", nullable: false, unique: true },
          { name: "profile", type: "JSONB", nullable: true },
        ]),
      }),
    ],
    relations: [relation("db-has-accounts", "contains-table", "db", "accounts-table")],
  };
}

test("registry exposes a table model and typed database containment relation", () => {
  const table = WORKBENCH_COMPONENTS.find((item) => item.kind === "data.postgresql-table");
  assert.ok(table);
  assert.ok(WORKBENCH_RELATIONS.some((item) => item.kind === "contains-table"));
  assert.ok(Array.isArray(JSON.parse(table.properties.find((field) => field.key === "columns").defaultValue)));
});

test("OpenAPI generation produces explicit OpenAPI 3.1 paths, response schemas, and path parameters", () => {
  const model = apiModel();
  const before = JSON.stringify(model);
  const generated = generateOpenApiArtifact(model);
  assert.equal(generated.ok, true, JSON.stringify(generated.errors));
  assert.equal(generated.modelRevision, 7);
  const spec = JSON.parse(generated.text);
  assert.equal(spec.openapi, "3.1.0");
  assert.equal(spec.info.title, "Accounts service API");
  assert.equal(spec.info.version, "2.1.0");
  assert.equal(spec.paths["/accounts/{accountId}"].get.parameters[0].name, "accountId");
  assert.equal(spec.paths["/accounts/{accountId}"].get.parameters[0].required, true);
  assert.equal(spec.paths["/accounts/{accountId}"].get.responses["200"].content["application/json"].schema.type, "object");
  assert.equal(spec.paths["/accounts/{accountId}"].get["x-sketchizi-source-entity-id"], "get-account");
  assert.equal(spec.paths["/accounts/{accountId}"].get["x-sketchizi-source-service-id"], "api");
  assert.equal(spec.paths["/accounts"].post.requestBody.content["application/json"].schema.required[0], "email");
  assert.equal(JSON.stringify(model), before, "generation must not mutate the canonical model");
});

test("OpenAPI generation blocks endpoints without exactly one exposing REST service", () => {
  const model = apiModel();
  model.relations = model.relations.filter((item) => item.targetId !== "get-account");
  const generated = generateOpenApiArtifact(model);
  assert.equal(generated.ok, false);
  assert.equal(generated.text, "");
  assert.ok(generated.errors.some((item) => item.code === "openapi.endpoint-owner-count" && item.entityIds.includes("get-account")));
});

test("OpenAPI generation blocks duplicate routes and malformed schema JSON", () => {
  const duplicateRouteModel = apiModel();
  duplicateRouteModel.entities[2].properties.path = "/accounts/{accountId}";
  duplicateRouteModel.entities[2].properties.method = "GET";
  const duplicateRoute = generateOpenApiArtifact(duplicateRouteModel);
  assert.ok(duplicateRoute.errors.some((item) => item.code === "openapi.duplicate-route"));

  const badSchemaModel = apiModel();
  badSchemaModel.entities[1].properties.responseSchema = "{not json";
  const badSchema = generateOpenApiArtifact(badSchemaModel);
  assert.ok(badSchema.errors.some((item) => item.code === "openapi.invalid-schema-json"));
  assert.equal(badSchema.text, "");
});

test("OpenAPI generation rejects invalid paths and duplicate operation IDs", () => {
  const badPathModel = apiModel();
  badPathModel.entities[1].properties.path = "accounts?id=2";
  assert.ok(generateOpenApiArtifact(badPathModel).errors.some((item) => item.code === "openapi.invalid-path"));

  const duplicateIdModel = apiModel();
  duplicateIdModel.entities[2].properties.operationId = "getAccount";
  assert.ok(generateOpenApiArtifact(duplicateIdModel).errors.some((item) => item.code === "openapi.duplicate-operation-id"));
});

test("SQL generation creates schema/table DDL with explicit primary and unique constraints", () => {
  const model = sqlModel();
  const before = JSON.stringify(model);
  const generated = generateSqlArtifact(model);
  assert.equal(generated.ok, true, JSON.stringify(generated.errors));
  assert.equal(generated.filename, "schema.sql");
  assert.match(generated.text, /CREATE SCHEMA IF NOT EXISTS "app";/);
  assert.match(generated.text, /CREATE TABLE IF NOT EXISTS "app"\."accounts"/);
  assert.match(generated.text, /"id" UUID NOT NULL/);
  assert.match(generated.text, /PRIMARY KEY \("id"\)/);
  assert.match(generated.text, /"email" VARCHAR\(320\) NOT NULL UNIQUE/);
  assert.match(generated.text, /"profile" JSONB/);
  assert.equal(JSON.stringify(model), before, "generation must not mutate the canonical model");
});

test("SQL generation rejects unowned tables, invalid identifiers, and unsafe/unmodeled column types", () => {
  const unowned = sqlModel();
  unowned.relations = [];
  assert.ok(generateSqlArtifact(unowned).errors.some((item) => item.code === "sql.table-owner-count"));

  const invalidIdentifier = sqlModel();
  invalidIdentifier.entities[1].properties.tableName = "accounts; DROP TABLE users";
  assert.ok(generateSqlArtifact(invalidIdentifier).errors.some((item) => item.code === "sql.invalid-table-name"));

  const unsafeType = sqlModel();
  unsafeType.entities[1].properties.columns = JSON.stringify([{ name: "id", type: "UUID); DROP TABLE accounts; --", primaryKey: true }]);
  const generated = generateSqlArtifact(unsafeType);
  assert.ok(generated.errors.some((item) => item.code === "sql.unsupported-column-type"));
  assert.equal(generated.text, "", "invalid DDL must not be downloadable");
});

test("SQL generation reports malformed column JSON, duplicate columns, and missing tables", () => {
  const badJson = sqlModel();
  badJson.entities[1].properties.columns = "[{broken";
  assert.ok(generateSqlArtifact(badJson).errors.some((item) => item.code === "sql.invalid-columns-json"));

  const duplicateColumns = sqlModel();
  duplicateColumns.entities[1].properties.columns = JSON.stringify([{ name: "id", type: "UUID" }, { name: "ID", type: "TEXT" }]);
  assert.ok(generateSqlArtifact(duplicateColumns).errors.some((item) => item.code === "sql.duplicate-column"));

  const noTables = sqlModel();
  noTables.entities = noTables.entities.filter((item) => item.kind !== "data.postgresql-table");
  noTables.relations = [];
  assert.ok(generateSqlArtifact(noTables).errors.some((item) => item.code === "sql.no-tables"));
});


test("artifact controls are wired into the Workbench panel with stale-preview download protection", async () => {
  const panel = await readFile(new URL("../src/features/workbench/WorkbenchPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /generateOpenApiArtifact/);
  assert.match(panel, /generateSqlArtifact/);
  assert.match(panel, /Generate OpenAPI/);
  assert.match(panel, /Generate SQL/);
  assert.match(panel, /disabled=\{artifactStale\}/);
  assert.match(panel, /property\.type === "json" \? <textarea/);
});

test("OpenAPI generation rejects unresolved schema references", () => {
  const model = apiModel();
  model.entities[1].properties.responseSchema = JSON.stringify({ $ref: "#/components/schemas/Account" });
  const generated = generateOpenApiArtifact(model);
  assert.ok(generated.errors.some((item) => item.code === "openapi.schema-ref-unsupported"));
  assert.equal(generated.text, "");
});

test("SQL generation rejects multiple database targets instead of emitting ambiguous DDL", () => {
  const model = sqlModel();
  model.entities.push(entity("db2", "data.postgresql-database", "Another PostgreSQL", { databaseName: "other_db", schema: "public" }));
  const generated = generateSqlArtifact(model);
  assert.ok(generated.errors.some((item) => item.code === "sql.multiple-databases"));
  assert.equal(generated.text, "");
});
