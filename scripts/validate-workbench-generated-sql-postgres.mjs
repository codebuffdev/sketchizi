import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createArtifactFixtures } from "./generate-workbench-artifact-fixtures.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSqlPath = path.join(projectRoot, "artifacts", "generated", "schema.sql");
export const DEFAULT_POSTGRES_URL = "postgresql://workbench:workbench@127.0.0.1:5432/workbench";

const MUTATION_OPT_IN = "WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION";
const REMOTE_OPT_IN = "WORKBENCH_POSTGRES_ALLOW_REMOTE";
const PROTECTED_DATABASE_NAMES = new Set(["prod", "production", "live", "customer-data", "customer_data", "customerdata"]);

function parsePostgresUrl(databaseUrl) {
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("WORKBENCH_POSTGRES_URL must be a valid PostgreSQL connection URL.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("WORKBENCH_POSTGRES_URL must use postgres:// or postgresql://.");
  }
  if (!parsed.hostname || !parsed.pathname || parsed.pathname === "/") {
    throw new Error("WORKBENCH_POSTGRES_URL must include a host and database name.");
  }
  return parsed;
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname).toLowerCase().replace(/^\[|\]$/gu, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

/** Refuse schema mutation unless explicitly enabled for a test database. */
export function assertSafePostgresTarget(databaseUrl, baseEnv = process.env) {
  const parsed = parsePostgresUrl(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!databaseName.trim()) {
    throw new Error("WORKBENCH_POSTGRES_URL must include a non-empty database name.");
  }
  if (PROTECTED_DATABASE_NAMES.has(databaseName.toLowerCase())) {
    throw new Error(`Refusing PostgreSQL schema mutation against protected database name '${databaseName}'. Choose a disposable test database.`);
  }
  const mutationOptIn = ["true", "1"].includes(String(baseEnv[MUTATION_OPT_IN] || "").toLowerCase());
  if (!mutationOptIn) {
    throw new Error(`${MUTATION_OPT_IN}=true is required before this check creates a schema, table, constraint, or index. Use a disposable test database only.`);
  }
  if (!isLoopbackHostname(parsed.hostname)) {
    const remoteOptIn = ["true", "1"].includes(String(baseEnv[REMOTE_OPT_IN] || "").toLowerCase());
    if (!remoteOptIn) {
      throw new Error(`${REMOTE_OPT_IN}=true is required for a non-loopback PostgreSQL host. Prefer a disposable local database or CI service.`);
    }
  }
  return { host: parsed.hostname, databaseName };
}

const catalogAssertions = String.raw`
DO $workbench_verify$
DECLARE
  accounts_table regclass := to_regclass('app.accounts');
  primary_key_count integer;
  email_unique_count integer;
  created_at_index_count integer;
  required_columns_count integer;
BEGIN
  IF accounts_table IS NULL THEN
    RAISE EXCEPTION 'Expected table app.accounts was not created';
  END IF;

  SELECT count(*) INTO primary_key_count
  FROM pg_constraint
  WHERE conrelid = accounts_table AND contype = 'p';
  IF primary_key_count <> 1 THEN
    RAISE EXCEPTION 'Expected one primary key on app.accounts; got %', primary_key_count;
  END IF;

  SELECT count(*) INTO email_unique_count
  FROM pg_constraint
  WHERE conrelid = accounts_table AND contype = 'u';
  IF email_unique_count <> 1 THEN
    RAISE EXCEPTION 'Expected one UNIQUE constraint on app.accounts; got %', email_unique_count;
  END IF;

  SELECT count(*) INTO created_at_index_count
  FROM pg_class idx
  JOIN pg_namespace ns ON ns.oid = idx.relnamespace
  WHERE ns.nspname = 'app' AND idx.relname = 'accounts_created_at_idx' AND idx.relkind = 'i';
  IF created_at_index_count <> 1 THEN
    RAISE EXCEPTION 'Expected index app.accounts_created_at_idx; got %', created_at_index_count;
  END IF;

  SELECT count(*) INTO required_columns_count
  FROM information_schema.columns
  WHERE table_schema = 'app'
    AND table_name = 'accounts'
    AND ((column_name = 'id' AND data_type = 'uuid' AND is_nullable = 'NO')
      OR (column_name = 'email' AND data_type = 'character varying' AND character_maximum_length = 320 AND is_nullable = 'NO')
      OR (column_name = 'created_at' AND data_type = 'timestamp with time zone' AND is_nullable = 'NO'));
  IF required_columns_count <> 3 THEN
    RAISE EXCEPTION 'Expected all three generated columns with the intended type/nullability; matched %', required_columns_count;
  END IF;
END;
$workbench_verify$;
`;

export function resolvePostgresConnection(databaseUrl = process.env.WORKBENCH_POSTGRES_URL || DEFAULT_POSTGRES_URL, baseEnv = process.env) {
  const parsed = parsePostgresUrl(databaseUrl);

  const env = {
    ...baseEnv,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGDATABASE: decodeURIComponent(parsed.pathname.slice(1)),
  };
  if (parsed.username) env.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);
  const sslMode = parsed.searchParams.get("sslmode");
  if (sslMode) env.PGSSLMODE = sslMode;
  return env;
}

function executePsql({ args, env, runCommand, stepLabel }) {
  const result = runCommand("psql", ["-X", "--set", "ON_ERROR_STOP=1", ...args], env);
  if (result?.error) {
    throw new Error(`${stepLabel} could not start psql: ${result.error.message || result.error}`);
  }
  if ((result?.status ?? 1) !== 0) {
    const details = [result?.stderr, result?.stdout].filter(Boolean).join("\n").trim();
    throw new Error(`${stepLabel} failed${details ? `:\n${details}` : ` (psql exit code ${result?.status ?? "unknown"})`}`);
  }
  return result;
}

/**
 * Apply generated DDL twice to prove it executes on PostgreSQL and is idempotent,
 * then query the live system catalog for its expected schema objects.
 * The caller supplies the psql invocation so the behavior can be unit tested offline.
 */
export async function validateGeneratedSqlAgainstPostgres({
  sqlPath = defaultSqlPath,
  databaseUrl = process.env.WORKBENCH_POSTGRES_URL || DEFAULT_POSTGRES_URL,
  runCommand = (command, args, env) => spawnSync(command, args, { cwd: projectRoot, env, encoding: "utf8", timeout: 120_000 }),
  baseEnv = process.env,
} = {}) {
  const sql = await readFile(sqlPath, "utf8");
  if (!sql.trim()) throw new Error("Generated SQL is empty; PostgreSQL integration validation did not run.");

  // This integration stage is intentionally scoped to the known, generated release fixture.
  // psql files can contain client meta-commands such as \connect and \!, which are not SQL
  // and can switch the connection or execute shell commands after the URL safety checks.
  // Never execute an arbitrary or modified SQL file through this guarded test stage.
  const expectedSql = createArtifactFixtures().sql.text;
  if (sql !== expectedSql) {
    if (/^\s*\\[A-Za-z]/mu.test(sql)) {
      throw new Error("Generated SQL contains a psql client meta-command. PostgreSQL integration validation accepts SQL-only fixture output; psql client commands that switch connections or execute shell commands are refused.");
    }
    throw new Error("SQL content does not exactly match the current Workbench-generated PostgreSQL validation fixture. Regenerate artifacts before running this integration stage; arbitrary SQL is not accepted.");
  }

  const safeTarget = assertSafePostgresTarget(databaseUrl, baseEnv);
  const env = resolvePostgresConnection(databaseUrl, baseEnv);
  const fileArgs = ["--file", path.resolve(sqlPath)];
  executePsql({ args: fileArgs, env, runCommand, stepLabel: "First PostgreSQL DDL application" });
  executePsql({ args: fileArgs, env, runCommand, stepLabel: "Idempotent PostgreSQL DDL re-application" });
  executePsql({ args: ["--command", catalogAssertions], env, runCommand, stepLabel: "PostgreSQL catalog assertions" });

  return {
    databaseHost: safeTarget.host,
    databaseName: safeTarget.databaseName,
    appliedTwice: true,
    checks: ["schema-and-table-exist", "primary-key", "unique-email", "created-at-index", "column-types-and-nullability"],
  };
}

async function main() {
  try {
    const result = await validateGeneratedSqlAgainstPostgres({
      sqlPath: process.argv[2] ? path.resolve(process.argv[2]) : defaultSqlPath,
    });
    console.log(`PASS — Generated DDL applied twice to PostgreSQL at ${result.databaseHost}/${result.databaseName}.`);
    console.log(`Verified: ${result.checks.join(", ")}.`);
  } catch (error) {
    console.error(`Generated SQL PostgreSQL integration validation failed: ${error?.stack || error}`);
    console.error("Use a disposable test database. Set WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION=true to opt in; for non-loopback hosts also set WORKBENCH_POSTGRES_ALLOW_REMOTE=true. Protected database names such as prod and production are refused.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
