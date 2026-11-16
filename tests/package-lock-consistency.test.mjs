import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inspectPackageLock } from "../scripts/check-package-lock-consistency.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));

test("the repository package manifest and lockfile are currently consistent", () => {
  const result = inspectPackageLock(packageJson, packageLock);
  assert.equal(result.valid, true, result.errors.join("\n"));
  assert.ok(result.checks.length >= 10);
});

test("detects a manifest/lock root package version mismatch", () => {
  const changed = structuredClone(packageLock);
  changed.packages[""].version = "0.0.0-invalid";
  const result = inspectPackageLock(packageJson, changed);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes("Package version differs")));
});

test("detects a changed direct dependency specification", () => {
  const changed = structuredClone(packageLock);
  changed.packages[""].dependencies.react = "^0.0.0-invalid";
  const result = inspectPackageLock(packageJson, changed);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes("dependencies.react differs")));
});

test("detects a missing direct dependency lock entry", () => {
  const changed = structuredClone(packageLock);
  delete changed.packages["node_modules/react"];
  const result = inspectPackageLock(packageJson, changed);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes('packages["node_modules/react"]')));
});

test("detects missing root package metadata", () => {
  const changed = structuredClone(packageLock);
  delete changed.packages[""];
  const result = inspectPackageLock(packageJson, changed);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes('packages[""] root entry')));
});

test("detects unsupported or missing lockfile version", () => {
  const changed = structuredClone(packageLock);
  changed.lockfileVersion = 1;
  const result = inspectPackageLock(packageJson, changed);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((message) => message.includes("lockfileVersion")));
});
