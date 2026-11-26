#!/usr/bin/env node
/**
 * Cross-platform launcher: node tests/responsive/scripts/run-responsive.mjs <smoke|full> [playwright args...]
 * Mirrors `npm run test:e2e` (installs the isolated e2e Playwright, then runs it).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const [profile = "full", ...rest] = process.argv.slice(2);
if (!["smoke", "full"].includes(profile)) {
  console.error(`Unknown profile "${profile}". Use smoke or full.`);
  process.exit(2);
}
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const env = { ...process.env, RESPONSIVE_PROFILE: profile };
const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, stdio: "inherit", env, shell: process.platform === "win32" });

if (!process.env.RESPONSIVE_SKIP_INSTALL) {
  const install = run(npm, ["install", "--prefix", "e2e", "--no-audit", "--no-fund"]);
  if (install.status !== 0) process.exit(install.status ?? 1);
}
const result = run(npx, ["--prefix", "e2e", "playwright", "test", "-c", "tests/responsive/playwright.responsive.config.js", ...rest]);
const report = path.join("tests", "responsive", "artifacts", "responsive-report.html");
console.log(`\nResponsive QA dashboard: ${report}\nJSON results:            ${path.join("tests", "responsive", "artifacts", "responsive-results.json")}`);
process.exit(result.status ?? 1);
