import { appendFile, readFile, readdir, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { join, relative, resolve } from "node:path";

const root = resolve(process.argv[2] || "dist");
const assetFiles = [];

async function collect(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) {
      await collect(path);
    } else if (item.isFile() && /\.(js|css)$/.test(item.name)) {
      const content = await readFile(path);
      const details = await stat(path);
      assetFiles.push({
        file: relative(root, path).replaceAll("\\", "/"),
        size: details.size,
        gzip: gzipSync(content).byteLength,
      });
    }
  }
}

const fmt = (bytes) => (bytes / 1024).toFixed(1) + " KiB";
await collect(root);
if (!assetFiles.length) {
  console.error("No built JavaScript or CSS files found. Run npm run build first.");
  process.exitCode = 1;
} else {
  assetFiles.sort((a, b) => b.size - a.size);
  const total = assetFiles.reduce((sum, item) => sum + item.size, 0);
  const totalGzip = assetFiles.reduce((sum, item) => sum + item.gzip, 0);
  const rows = assetFiles.map((item) => "| " + item.file + " | " + fmt(item.size) + " | " + fmt(item.gzip) + " |");
  const report = [
    "## Build asset baseline",
    "",
    "Measured production JS/CSS assets, before runtime caching. Gzip sizes are estimates; these are **not** performance timings.",
    "",
    "| Asset | Raw | Gzip |",
    "| --- | ---: | ---: |",
    ...rows,
    "| **Total JS/CSS** | **" + fmt(total) + "** | **" + fmt(totalGzip) + "** |",
  ].join("\n") + "\n";

  console.log(report);
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, "\n" + report);
  }
}
