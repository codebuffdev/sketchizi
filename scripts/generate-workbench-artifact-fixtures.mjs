import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { generateOpenApiArtifact, generateSqlArtifact } from "../src/features/workbench/workbenchArtifacts.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
export const DEFAULT_OUTPUT_DIRECTORY = path.join(projectRoot, "artifacts", "generated");

const entity = (id, kind, name, properties = {}) => ({ id, kind, name, properties });
const relation = (id, kind, sourceId, targetId) => ({ id, kind, sourceId, targetId, viewIds: ["system"], properties: {} });

export function createArtifactFixtures() {
  const apiModel = {
    modelRevision: 42,
    entities: [
      entity("accounts-api", "backend.rest-service", "Accounts service", { basePath: "/api", apiVersion: "1.0.0" }),
      entity("get-account", "backend.api-endpoint", "Get account", {
        method: "GET",
        path: "/accounts/{accountId}",
        operationId: "getAccount",
        summary: "Get an account by ID",
        responseSchema: JSON.stringify({
          type: "object",
          properties: { id: { type: "string", format: "uuid" }, email: { type: "string", format: "email" } },
          required: ["id", "email"],
          additionalProperties: false,
        }),
      }),
      entity("create-account", "backend.api-endpoint", "Create account", {
        method: "POST",
        path: "/accounts",
        operationId: "createAccount",
        summary: "Create an account",
        requestSchema: JSON.stringify({
          type: "object",
          properties: { email: { type: "string", format: "email" } },
          required: ["email"],
          additionalProperties: false,
        }),
        responseSchema: JSON.stringify({
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
          additionalProperties: false,
        }),
      }),
    ],
    relations: [
      relation("expose-get-account", "exposes", "accounts-api", "get-account"),
      relation("expose-create-account", "exposes", "accounts-api", "create-account"),
    ],
  };

  const sqlModel = {
    modelRevision: 42,
    entities: [
      entity("postgres", "data.postgresql-database", "Accounts database", { databaseName: "accounts", schema: "app" }),
      entity("accounts-table", "data.postgresql-table", "Accounts", {
        tableName: "accounts",
        columns: JSON.stringify([
          { name: "id", type: "UUID", primaryKey: true, nullable: false },
          { name: "email", type: "VARCHAR(320)", nullable: false, unique: true },
          { name: "created_at", type: "TIMESTAMPTZ", nullable: false },
        ]),
        indexes: JSON.stringify([{ name: "accounts_created_at_idx", columns: ["created_at"], unique: false, method: "btree" }]),
      }),
    ],
    relations: [relation("contains-accounts", "contains-table", "postgres", "accounts-table")],
  };

  const openapi = generateOpenApiArtifact(apiModel);
  const sql = generateSqlArtifact(sqlModel);
  const errors = [
    ...openapi.errors.map((item) => `OpenAPI: ${item.code}: ${item.message}`),
    ...sql.errors.map((item) => `SQL: ${item.code}: ${item.message}`),
  ];
  if (!openapi.ok || !sql.ok) {
    throw new Error(`Could not generate valid artifact fixtures:\n${errors.join("\n")}`);
  }

  return {
    openapi: { filename: openapi.filename, text: openapi.text, modelRevision: openapi.modelRevision },
    sql: { filename: sql.filename, text: sql.text, modelRevision: sql.modelRevision },
  };
}

export async function writeArtifactFixtures(outputDirectory = DEFAULT_OUTPUT_DIRECTORY) {
  const fixtures = createArtifactFixtures();
  await mkdir(outputDirectory, { recursive: true });
  const openapiPath = path.join(outputDirectory, "openapi.json");
  const sqlPath = path.join(outputDirectory, "schema.sql");
  const manifestPath = path.join(outputDirectory, "manifest.json");
  await writeFile(openapiPath, fixtures.openapi.text, "utf8");
  await writeFile(sqlPath, fixtures.sql.text, "utf8");
  await writeFile(manifestPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    modelRevision: 42,
    files: ["openapi.json", "schema.sql"],
    purpose: "Validation fixtures generated from the Sketchizi Workbench artifact generators; not production deployment artifacts.",
  }, null, 2)}\n`, "utf8");
  return { openapiPath, sqlPath, manifestPath };
}

async function main() {
  const outputDirectory = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUTPUT_DIRECTORY;
  const result = await writeArtifactFixtures(outputDirectory);
  console.log(`Generated OpenAPI fixture: ${path.relative(projectRoot, result.openapiPath)}`);
  console.log(`Generated PostgreSQL DDL fixture: ${path.relative(projectRoot, result.sqlPath)}`);
  console.log(`Artifact fixture manifest: ${path.relative(projectRoot, result.manifestPath)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Artifact fixture generation failed: ${error?.stack || error}`);
    process.exitCode = 1;
  });
}
