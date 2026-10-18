import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FONT_EXTENSIONS = new Set([".woff", ".woff2", ".ttf", ".otf"]);
const scriptPath = fileURLToPath(import.meta.url);
const defaultProjectRoot = path.resolve(path.dirname(scriptPath), "..");

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFontFiles(directory, relativeTo = directory) {
  if (!(await exists(directory))) return [];
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFontFiles(fullPath, relativeTo));
    } else if (entry.isFile() && FONT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(path.relative(relativeTo, fullPath).split(path.sep).join("/"));
    }
  }
  return files.sort();
}

export async function inspectExcalidrawFontAssets(projectRoot = defaultProjectRoot) {
  const packagePath = path.join(projectRoot, "package.json");
  const lockPath = path.join(projectRoot, "package-lock.json");
  const installedPackagePath = path.join(projectRoot, "node_modules", "@excalidraw", "excalidraw", "package.json");
  const installedPackageRoot = path.dirname(installedPackagePath);
  const fontsDirectory = path.join(installedPackageRoot, "dist", "prod", "fonts");

  const projectPackage = await readJson(packagePath);
  const lockFile = await readJson(lockPath);
  const installedPackage = await readJson(installedPackagePath);
  const declaredVersion = projectPackage?.dependencies?.["@excalidraw/excalidraw"]
    ?? projectPackage?.devDependencies?.["@excalidraw/excalidraw"]
    ?? null;
  const lockedVersion = lockFile?.packages?.["node_modules/@excalidraw/excalidraw"]?.version ?? null;
  const installedVersion = installedPackage?.version ?? null;
  const fontFiles = await listFontFiles(fontsDirectory);
  const issues = [];

  if (!projectPackage) issues.push("package.json is missing or invalid.");
  if (!lockFile) issues.push("package-lock.json is missing or invalid.");
  if (!declaredVersion) issues.push("@excalidraw/excalidraw is not declared in package.json.");
  if (!lockedVersion) issues.push("package-lock.json has no locked @excalidraw/excalidraw package entry.");
  if (declaredVersion && lockedVersion && declaredVersion !== lockedVersion) {
    issues.push(`Dependency version mismatch: package.json declares ${declaredVersion}, but package-lock.json locks ${lockedVersion}.`);
  }
  if (!installedVersion) {
    issues.push("Installed @excalidraw/excalidraw package.json is missing; confirm npm ci completed successfully.");
  } else if (lockedVersion && installedVersion !== lockedVersion) {
    issues.push(`Installed dependency version ${installedVersion} does not match lockfile version ${lockedVersion}.`);
  }
  if (!(await exists(fontsDirectory))) {
    issues.push("Expected font directory is missing: node_modules/@excalidraw/excalidraw/dist/prod/fonts.");
  } else if (fontFiles.length === 0) {
    issues.push("Expected font directory exists but contains no .woff, .woff2, .ttf, or .otf files.");
  }

  return {
    schemaVersion: 1,
    status: issues.length === 0 ? "passed" : "failed",
    projectVersion: projectPackage?.version ?? null,
    dependency: {
      name: "@excalidraw/excalidraw",
      declaredVersion,
      lockedVersion,
      installedVersion,
    },
    fonts: {
      directory: path.relative(projectRoot, fontsDirectory).split(path.sep).join("/"),
      directoryExists: await exists(fontsDirectory),
      fontFileCount: fontFiles.length,
      sampleFiles: fontFiles.slice(0, 8),
    },
    issues,
  };
}

export function renderFontPreflight(report) {
  const lines = [
    `Excalidraw font preflight: ${report.status.toUpperCase()}`,
    `Project version: ${report.projectVersion ?? "unknown"}`,
    `Dependency declared: ${report.dependency.declaredVersion ?? "missing"}`,
    `Dependency locked: ${report.dependency.lockedVersion ?? "missing"}`,
    `Dependency installed: ${report.dependency.installedVersion ?? "missing"}`,
    `Font directory: ${report.fonts.directory} (${report.fonts.directoryExists ? "found" : "missing"})`,
    `Font files: ${report.fonts.fontFileCount}`,
  ];
  if (report.fonts.sampleFiles.length) {
    lines.push("Sample assets:", ...report.fonts.sampleFiles.map((name) => `  - ${name}`));
  }
  if (report.issues.length) lines.push("Issues:", ...report.issues.map((issue) => `  - ${issue}`));
  else lines.push("Pinned Excalidraw version and self-hosted font assets are consistent.");
  return lines.join("\n");
}

async function main() {
  const report = await inspectExcalidrawFontAssets();
  console.log(renderFontPreflight(report));
  console.log(`WORKBENCH_EXCALIDRAW_FONT_PREFLIGHT_JSON=${JSON.stringify(report)}`);
  if (report.status !== "passed") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Excalidraw font preflight failed unexpectedly: ${error?.stack || error}`);
    process.exitCode = 1;
  });
}
