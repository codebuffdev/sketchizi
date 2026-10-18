import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSqlPath = path.join(projectRoot, "artifacts", "generated", "schema.sql");

/** Validate DDL with the real PostgreSQL parser exposed by pgsql-parser. */
export async function validateGeneratedSql(sql, parser = null) {
  if (typeof sql !== "string" || !sql.trim()) throw new Error("Generated SQL is empty.");
  const parseSql = parser ?? (await import("pgsql-parser")).parse;
  if (typeof parseSql !== "function") throw new Error("pgsql-parser did not export a parse() function.");
  const statements = await parseSql(sql);
  if (!Array.isArray(statements) || statements.length === 0) {
    throw new Error("PostgreSQL parser returned no statements for generated SQL.");
  }
  return { statementCount: statements.length };
}

async function main() {
  const sqlPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultSqlPath;
  const sql = await readFile(sqlPath, "utf8");
  const result = await validateGeneratedSql(sql);
  console.log(`PASS — PostgreSQL parser accepted ${result.statementCount} statement(s) in ${path.relative(projectRoot, sqlPath)}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Generated SQL validation failed: ${error?.stack || error}`);
    process.exitCode = 1;
  });
}
