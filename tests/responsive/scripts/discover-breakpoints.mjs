#!/usr/bin/env node
/**
 * Scans src/**\/*.css (and responsiveShell.js) for the breakpoints the app
 * ACTUALLY uses, so the boundary list is evidence-based rather than assumed.
 * Writes tests/responsive/artifacts/discovered-breakpoints.json.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");

export function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".css")) out.push(full);
  }
  return out;
}

export function extractBreakpoints(css) {
  const found = [];
  const re = /@media([^{]+)\{/g;
  let m;
  while ((m = re.exec(css))) {
    const query = m[1].trim();
    for (const part of query.matchAll(/\((min|max)-(width|height):\s*([\d.]+)(px|em|rem)\)/g)) {
      const px = part[4] === "px" ? Number(part[3]) : Number(part[3]) * 16;
      found.push({ axis: part[2], kind: part[1], px, query });
    }
  }
  return found;
}

export function discover(srcDir = path.join(root, "src")) {
  const byWidth = new Map();
  for (const file of walk(srcDir)) {
    for (const bp of extractBreakpoints(fs.readFileSync(file, "utf8"))) {
      if (bp.axis !== "width") continue;
      const entry = byWidth.get(bp.px) || { px: bp.px, count: 0, kinds: new Set(), files: new Set() };
      entry.count += 1;
      entry.kinds.add(bp.kind);
      entry.files.add(path.relative(root, file));
      byWidth.set(bp.px, entry);
    }
  }
  return [...byWidth.values()].sort((a, b) => b.count - a.count).map((e) => ({ px: e.px, count: e.count, kinds: [...e.kinds], files: [...e.files].slice(0, 6) }));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("discover-breakpoints.mjs")) {
  const list = discover();
  const outDir = path.join(here, "../artifacts");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "discovered-breakpoints.json"), JSON.stringify({ generatedAt: new Date().toISOString(), widths: list }, null, 2));
  console.log("Breakpoints used by the app (width axis), most common first:");
  for (const e of list.slice(0, 20)) console.log(`  ${String(e.px).padStart(7)}px  x${String(e.count).padStart(3)}  ${e.kinds.join("/")}`);
  console.log("\nWrote tests/responsive/artifacts/discovered-breakpoints.json");
}
