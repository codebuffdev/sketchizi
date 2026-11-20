import { readFile } from "node:fs/promises";

function parseTap(source, label) {
  const tests = source.match(/^# tests (\d+)$/m);
  const failuresReported = source.match(/^# fail (\d+)$/m);
  if (!tests || !failuresReported) {
    throw new Error(`${label} test output is incomplete; TAP summary was not found.`);
  }
  const failures = [];
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*not ok \d+ - (.+?)(?:\s+#.*)?$/);
    if (match) {
      const name = match[1].trim().replace(/^.*\\/tests\\//, "tests/");
      failures.push(name);
    }
  }
  if (failures.length !== Number(failuresReported[1])) {
    throw new Error(`${label} TAP summary reports ${failuresReported[1]} failures, but ${failures.length} failure records were parsed.`);
  }
  return { tests: Number(tests[1]), failures };
}

const [baselinePath, currentPath] = process.argv.slice(2);
if (!baselinePath || !currentPath) {
  throw new Error("Usage: node scripts/compare-test-baseline.mjs <main-tap> <current-tap>");
}
const [baselineSource, currentSource] = await Promise.all([
  readFile(baselinePath, "utf8"),
  readFile(currentPath, "utf8"),
]);
const baseline = parseTap(baselineSource, "main");
const current = parseTap(currentSource, "current branch");
const baselineCounts = new Map();
for (const name of baseline.failures) baselineCounts.set(name, (baselineCounts.get(name) || 0) + 1);
const currentCounts = new Map();
for (const name of current.failures) currentCounts.set(name, (currentCounts.get(name) || 0) + 1);
const newFailures = [];
for (const [name, count] of currentCounts) {
  const inheritedCount = baselineCounts.get(name) || 0;
  for (let index = inheritedCount; index < count; index += 1) newFailures.push(name);
}
if (newFailures.length) {
  console.error(`Regression suite introduced ${newFailures.length} failure(s) beyond main:`);
  for (const name of newFailures) console.error(`- ${name}`);
  process.exit(1);
}
console.log(`PASS: ${current.tests} tests checked; ${current.failures.length} failure(s) remain, all already present on main (${baseline.failures.length} baseline failure(s)).`);
