import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { inspectExcalidrawFontAssets } from "./verify-excalidraw-font-assets.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function checkBuildPrerequisites(root = projectRoot) {
  const issues = [];
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const htmlPath = path.join(root, "index.html");
  const viteBinary = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vite.cmd" : "vite");
  const htmlExists = await exists(htmlPath);
  const viteExists = await exists(viteBinary);
  const fonts = await inspectExcalidrawFontAssets(root);

  if (!htmlExists) {
    issues.push("index.html is missing; restore the application entry page before building.");
  } else {
    const html = await readFile(htmlPath, "utf8");
    if (!html.includes('src="/src/main.jsx"') || !html.includes('id="root"')) {
      issues.push("index.html does not contain the expected Vite entry module and React mount point.");
    }
  }
  if (!packageJson.scripts?.build || !packageJson.devDependencies?.vite) {
    issues.push("The package manifest must declare a build script and Vite dependency.");
  }
  if (!viteExists) {
    issues.push("Vite executable is missing. Run npm ci in an environment with registry access, then retry.");
  }
  if (fonts.status !== "passed") issues.push(...fonts.issues);

  return {
    schemaVersion: 1,
    status: issues.length === 0 ? "ready" : "blocked",
    projectVersion: packageJson.version ?? null,
    nodeVersion: process.version,
    checks: {
      entryPage: htmlExists,
      viteExecutable: viteExists,
      excalidrawFontAssets: fonts.status,
    },
    issues,
    nextCommand: issues.length === 0 ? "npm run build" : "Resolve the listed prerequisites, then rerun this check.",
  };
}

export function renderBuildPrerequisites(report) {
  const lines = [
    `Sketchizi build prerequisites: ${report.status.toUpperCase()}`,
    `Project version: ${report.projectVersion ?? "unknown"}`,
    `Node.js: ${report.nodeVersion}`,
    `Entry page: ${report.checks.entryPage ? "found" : "missing"}`,
    `Vite executable: ${report.checks.viteExecutable ? "found" : "missing"}`,
    `Excalidraw font assets: ${report.checks.excalidrawFontAssets}`,
  ];
  if (report.issues.length) lines.push("Issues:", ...report.issues.map((issue) => `  - ${issue}`));
  lines.push(`Next: ${report.nextCommand}`);
  return lines.join("\n");
}

async function main() {
  const report = await checkBuildPrerequisites();
  console.log(renderBuildPrerequisites(report));
  console.log(`SKETCHIZI_BUILD_PREREQUISITES_JSON=${JSON.stringify(report)}`);
  if (report.status !== "ready") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Build prerequisite check failed unexpectedly: ${error?.stack || error}`);
    process.exitCode = 1;
  });
}
