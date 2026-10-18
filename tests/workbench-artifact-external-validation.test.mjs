import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createArtifactFixtures } from "../scripts/generate-workbench-artifact-fixtures.mjs";
import { validateGeneratedSql } from "../scripts/validate-workbench-generated-sql.mjs";

const fixture = createArtifactFixtures();

test("artifact fixture generator emits parseable OpenAPI 3.1 JSON and expected API routes", () => {
  const spec = JSON.parse(fixture.openapi.text);
  assert.equal(spec.openapi, "3.1.0");
  assert.equal(spec.info.version, "1.0.0");
  assert.ok(spec.paths["/accounts/{accountId}"].get);
  assert.ok(spec.paths["/accounts"].post);
  assert.equal(spec.paths["/accounts/{accountId}"].get.parameters[0].required, true);
});

test("artifact fixture generator emits SQL covering schema, table, constraint and index generation", () => {
  assert.match(fixture.sql.text, /CREATE SCHEMA IF NOT EXISTS "app";/);
  assert.match(fixture.sql.text, /CREATE TABLE IF NOT EXISTS "app"\."accounts"/);
  assert.match(fixture.sql.text, /PRIMARY KEY \("id"\)/);
  assert.match(fixture.sql.text, /CREATE INDEX IF NOT EXISTS "accounts_created_at_idx"/);
});

test("SQL parser adapter calls the injected PostgreSQL parser and requires statements", async () => {
  const expectedSql = fixture.sql.text;
  let received = "";
  const validated = await validateGeneratedSql(expectedSql, async (sql) => {
    received = sql;
    return [{ RawStmt: {} }, { RawStmt: {} }, { RawStmt: {} }];
  });
  assert.equal(received, expectedSql);
  assert.equal(validated.statementCount, 3);
});

test("SQL parser adapter accepts pgsql-parser's result object with a stmts array", async () => {
  const validated = await validateGeneratedSql(fixture.sql.text, async () => ({
    version: 170000,
    stmts: [{ RawStmt: {} }, { RawStmt: {} }, { RawStmt: {} }],
  }));
  assert.equal(validated.statementCount, 3);
});

test("SQL parser adapter rejects empty SQL and empty parser results", async () => {
  await assert.rejects(() => validateGeneratedSql("  ", async () => []), /empty/);
  await assert.rejects(() => validateGeneratedSql("SELECT 1", async () => []), /no statements/);
  await assert.rejects(() => validateGeneratedSql("SELECT 1", async () => ({ stmts: [] })), /no statements/);
});

test("Redocly validation configuration includes the minimal ruleset", async () => {
  const config = await readFile(new URL("../redocly.workbench.yaml", import.meta.url), "utf8");
  assert.match(config, /extends:\s*\n\s+- minimal/);
  assert.match(config, /operation-4xx-response:\s*off/);
});
