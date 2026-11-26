#!/usr/bin/env node
/**
 * Compare two diffable reports (historical regression tracking).
 *   node tests/responsive/scripts/compare-results.mjs <previous.json> <latest.json>
 * Exit code 1 when new findings appeared.
 */
import fs from "node:fs";
import { diffReports } from "../reporters/aggregate.js";

const [prevPath, nextPath = "tests/responsive/artifacts/responsive-diffable.json"] = process.argv.slice(2);
if (!prevPath) { console.error("Usage: compare-results.mjs <previous.json> [latest.json]"); process.exit(2); }
const diff = diffReports(JSON.parse(fs.readFileSync(prevPath, "utf8")), JSON.parse(fs.readFileSync(nextPath, "utf8")));
console.log(`New findings: ${diff.added.length}   Resolved: ${diff.resolved.length}   Severity changed: ${diff.changed.length}`);
for (const k of diff.added.slice(0, 50)) console.log(`  + ${k}`);
for (const k of diff.resolved.slice(0, 50)) console.log(`  - ${k}`);
for (const c of diff.changed.slice(0, 50)) console.log(`  ~ ${c.key} (${c.from} -> ${c.to})`);
process.exit(diff.added.length ? 1 : 0);
