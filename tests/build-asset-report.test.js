import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("../scripts/report-build-assets.mjs", import.meta.url));

test("asset report measures JS/CSS, including gzip, and writes a CI summary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sketchizi-build-report-"));
  try {
    const assets = join(dir, "assets");
    const summary = join(dir, "summary.md");
    await mkdir(assets);
    await writeFile(join(assets, "editor.js"), "const value = 1;".repeat(80));
    await writeFile(join(assets, "editor.css"), ".button{color:red;}".repeat(10));
    await writeFile(join(assets, "ignored.png"), "binary placeholder");
    const output = execFileSync(process.execPath, [script, dir], {
      env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
      encoding: "utf8",
    });
    const markdown = await readFile(summary, "utf8");
    for (const result of [output, markdown]) {
      assert.match(result, /Build asset baseline/);
      assert.match(result, /assets\/editor\.js/);
      assert.match(result, /assets\/editor\.css/);
      assert.doesNotMatch(result, /ignored\.png/);
      assert.match(result, /Total JS\/CSS/);
      assert.match(result, /Gzip/);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
