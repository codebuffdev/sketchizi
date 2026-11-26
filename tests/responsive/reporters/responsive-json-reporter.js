import fs from "node:fs";
import path from "node:path";
import { buildReport, toDiffable, stripThumbs } from "./aggregate.js";
import { failThreshold } from "../helpers/findings.js";

/** Shared collector used by both reporters (no Playwright import needed). */
export function readRecord(test, result) {
  const att = (result.attachments || []).find((a) => a.name === "qa-report" && a.body);
  let qa = null;
  if (att) { try { qa = JSON.parse(att.body.toString("utf8")); } catch { qa = null; } }
  const meta = test.parent?.project()?.metadata?.viewport;
  const viewport = qa?.viewport || meta || { id: "unknown", name: "unknown", width: 0, height: 0 };
  const suite = qa?.suite || path.basename(test.location.file).replace(/\.spec\.js$/, "");
  const failedStatus = result.status === "failed" || result.status === "timedOut" || result.status === "interrupted";
  return {
    suite,
    title: qa?.title || test.titlePath().slice(3).join(" › ") || test.title,
    viewport,
    status: test.outcome() === "flaky" ? "flaky" : result.status,
    durationMs: result.duration,
    checkpoints: qa?.checkpoints || [],
    findings: qa?.findings || [],
    network: qa?.network || null,
    error: failedStatus && result.error ? String(result.error.message || "").split("\n").slice(0, 6).join("\n") : null,
  };
}

export default class ResponsiveJsonReporter {
  constructor(options = {}) {
    this.outputDir = options.outputDir || path.resolve("tests/responsive/artifacts");
    this.profile = options.profile || process.env.RESPONSIVE_PROFILE || "full";
    this.records = new Map();
  }
  printsToStdio() { return false; }
  onTestEnd(test, result) { this.records.set(test.id, readRecord(test, result)); }
  onEnd() {
    const report = buildReport([...this.records.values()], { profile: this.profile, failOn: failThreshold() });
    fs.mkdirSync(this.outputDir, { recursive: true });
    fs.writeFileSync(path.join(this.outputDir, "responsive-results.json"), JSON.stringify(stripThumbs(report), null, 2));
    fs.writeFileSync(path.join(this.outputDir, "responsive-diffable.json"), JSON.stringify(toDiffable(report), null, 2));
  }
}
