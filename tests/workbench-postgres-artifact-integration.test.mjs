import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createArtifactFixtures } from "../scripts/generate-workbench-artifact-fixtures.mjs";
import {
  DEFAULT_POSTGRES_URL,
  assertSafePostgresTarget,
  resolvePostgresConnection,
  validateGeneratedSqlAgainstPostgres,
} from "../scripts/validate-workbench-generated-sql-postgres.mjs";

const fixtureDirectory = await mkdtemp(path.join(os.tmpdir(), "sketchizi-pg-fixture-"));
const fixtureSqlPath = path.join(fixtureDirectory, "schema.sql");
await writeFile(fixtureSqlPath, createArtifactFixtures().sql.text, "utf8");
after(async () => rm(fixtureDirectory, { recursive: true, force: true }));

function okResult(stdout = "") {
  return { status: 0, stdout, stderr: "", error: undefined };
}

test("PostgreSQL URL is translated to libpq environment variables without exposing credentials in args", () => {
  const env = resolvePostgresConnection("postgresql://workbench:secret%40pass@db.example.test:5544/workbench?sslmode=require", {});
  assert.equal(env.PGHOST, "db.example.test");
  assert.equal(env.PGPORT, "5544");
  assert.equal(env.PGDATABASE, "workbench");
  assert.equal(env.PGUSER, "workbench");
  assert.equal(env.PGPASSWORD, "secret@pass");
  assert.equal(env.PGSSLMODE, "require");
  assert.equal(DEFAULT_POSTGRES_URL, "postgresql://workbench:workbench@127.0.0.1:5432/workbench");
});

test("generated DDL is applied twice and catalog assertions run last", async () => {
  const calls = [];
  const result = await validateGeneratedSqlAgainstPostgres({
    sqlPath: fixtureSqlPath,
    databaseUrl: DEFAULT_POSTGRES_URL,
    baseEnv: { WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION: "true" },
    runCommand: (command, args, env) => {
      calls.push({ command, args, env });
      return okResult(calls.length === 3 ? "DO" : "CREATE");
    },
  });

  assert.equal(calls.length, 3);
  assert.ok(calls.every((call) => call.command === "psql"));
  assert.deepEqual(calls[0].args, calls[1].args);
  assert.ok(calls[0].args.includes("--file"));
  assert.ok(calls[2].args.includes("--command"));
  assert.match(calls[2].args.at(-1), /created_at_index_count/);
  assert.equal(calls[0].env.PGPASSWORD, "workbench");
  assert.equal(result.appliedTwice, true);
  assert.deepEqual(result.checks, [
    "schema-and-table-exist",
    "primary-key",
    "unique-email",
    "created-at-index",
    "column-types-and-nullability",
  ]);
});


test("PostgreSQL execution refuses psql meta-commands before opening a database connection", async () => {
  const maliciousSqlPath = path.join(fixtureDirectory, "schema-with-psql-meta-command.sql");
  await writeFile(maliciousSqlPath, `${createArtifactFixtures().sql.text}\n\\connect production\n`, "utf8");
  const calls = [];
  try {
    await assert.rejects(
      () => validateGeneratedSqlAgainstPostgres({
        sqlPath: maliciousSqlPath,
        databaseUrl: DEFAULT_POSTGRES_URL,
        baseEnv: { WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION: "true" },
        runCommand: (...args) => { calls.push(args); return okResult(); },
      }),
      /contains a psql client meta-command/s,
    );
    assert.equal(calls.length, 0, "psql must not run when a client meta-command is present");
  } finally {
    await rm(maliciousSqlPath, { force: true });
  }
});

test("PostgreSQL execution refuses modified or arbitrary SQL before psql", async () => {
  const alteredSqlPath = path.join(fixtureDirectory, "schema-altered.sql");
  await writeFile(alteredSqlPath, `${createArtifactFixtures().sql.text}\nDROP TABLE app.accounts;\n`, "utf8");
  const calls = [];
  try {
    await assert.rejects(
      () => validateGeneratedSqlAgainstPostgres({
        sqlPath: alteredSqlPath,
        databaseUrl: DEFAULT_POSTGRES_URL,
        baseEnv: { WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION: "true" },
        runCommand: (...args) => { calls.push(args); return okResult(); },
      }),
      /does not exactly match the current Workbench-generated PostgreSQL validation fixture/,
    );
    assert.equal(calls.length, 0, "modified SQL must be rejected before database access");
  } finally {
    await rm(alteredSqlPath, { force: true });
  }
});

test("PostgreSQL integration stops at the first DDL failure", async () => {
  const calls = [];
  await assert.rejects(
    () => validateGeneratedSqlAgainstPostgres({
      sqlPath: fixtureSqlPath,
      databaseUrl: DEFAULT_POSTGRES_URL,
      baseEnv: { WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION: "true" },
      runCommand: (command, args) => {
        calls.push({ command, args });
        return { status: 1, stdout: "", stderr: "syntax error at or near TABLE" };
      },
    }),
    /First PostgreSQL DDL application failed.*syntax error at or near TABLE/s,
  );
  assert.equal(calls.length, 1);
});

test("PostgreSQL integration reports an idempotency failure separately", async () => {
  const calls = [];
  await assert.rejects(
    () => validateGeneratedSqlAgainstPostgres({
      sqlPath: fixtureSqlPath,
      databaseUrl: DEFAULT_POSTGRES_URL,
      baseEnv: { WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION: "true" },
      runCommand: () => {
        calls.push(true);
        return calls.length === 2 ? { status: 1, stdout: "", stderr: "relation already exists" } : okResult();
      },
    }),
    /Idempotent PostgreSQL DDL re-application failed.*relation already exists/s,
  );
  assert.equal(calls.length, 2);
});

test("PostgreSQL integration rejects invalid connection URLs and empty SQL", async () => {
  assert.throws(() => resolvePostgresConnection("http://db.example.test/workbench"), /must use postgres/);

  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "sketchizi-pg-empty-"));
  const emptySqlPath = path.join(temporaryDirectory, "empty.sql");
  try {
    await writeFile(emptySqlPath, "  \n", "utf8");
    await assert.rejects(
      () => validateGeneratedSqlAgainstPostgres({
        sqlPath: emptySqlPath,
        databaseUrl: DEFAULT_POSTGRES_URL,
        baseEnv: { WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION: "true" },
        runCommand: () => {
          throw new Error("psql must not run for empty SQL");
        },
      }),
      /Generated SQL is empty/,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("missing psql executable produces an actionable integration-stage error", async () => {
  await assert.rejects(
    () => validateGeneratedSqlAgainstPostgres({
      sqlPath: fixtureSqlPath,
      databaseUrl: DEFAULT_POSTGRES_URL,
      baseEnv: { WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION: "true" },
      runCommand: () => ({ status: null, error: { message: "spawn psql ENOENT" }, stderr: "" }),
    }),
    /First PostgreSQL DDL application could not start psql: spawn psql ENOENT/,
  );
});


test("schema mutation is refused unless the explicit disposable-database opt-in is set", async () => {
  const calls = [];
  await assert.rejects(
    () => validateGeneratedSqlAgainstPostgres({
      sqlPath: fixtureSqlPath,
      databaseUrl: DEFAULT_POSTGRES_URL,
      baseEnv: {},
      runCommand: (...args) => { calls.push(args); return okResult(); },
    }),
    /WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION=true is required/
  );
  assert.equal(calls.length, 0, "the guard must stop before invoking psql");
});

test("non-loopback database hosts require a second explicit opt-in", () => {
  assert.throws(
    () => assertSafePostgresTarget("postgresql://tester:secret@db.example.test:5432/workbench_test", {
      WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION: "true",
    }),
    /WORKBENCH_POSTGRES_ALLOW_REMOTE=true is required/
  );
  assert.deepEqual(
    assertSafePostgresTarget("postgresql://tester:secret@db.example.test:5432/workbench_test", {
      WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION: "true",
      WORKBENCH_POSTGRES_ALLOW_REMOTE: "true",
    }),
    { host: "db.example.test", databaseName: "workbench_test" },
  );
});

test("protected production-like database names are rejected even with opt-ins", () => {
  for (const databaseName of ["prod", "production", "live", "customer-data", "customer_data", "customerdata"]) {
    assert.throws(
      () => assertSafePostgresTarget(`postgresql://tester:secret@127.0.0.1:5432/${databaseName}`, {
        WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION: "true",
        WORKBENCH_POSTGRES_ALLOW_REMOTE: "true",
      }),
      /Refusing PostgreSQL schema mutation against protected database name/
    );
  }
});

test("loopback IPv4 and IPv6 targets are accepted only with schema-mutation opt-in", () => {
  assert.deepEqual(
    assertSafePostgresTarget("postgresql://tester:secret@127.0.0.1:5432/workbench", { WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION: "true" }),
    { host: "127.0.0.1", databaseName: "workbench" },
  );
  assert.deepEqual(
    assertSafePostgresTarget("postgresql://tester:secret@[::1]:5432/workbench", { WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION: "true" }),
    { host: "[::1]", databaseName: "workbench" },
  );
});
