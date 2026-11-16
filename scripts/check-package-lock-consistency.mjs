import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const dependencySections = ["dependencies", "devDependencies", "optionalDependencies"];

/**
 * Dependency-free validation for the package metadata duplicated in package-lock.json.
 * This does not replace npm ci; it catches simple manifest/lock drift without registry access.
 */
export function inspectPackageLock(packageJson, packageLock) {
  const errors = [];
  const checks = [];
  const addCheck = (name, valid, message) => {
    checks.push({ name, valid, message });
    if (!valid) errors.push(message);
  };

  addCheck(
    "lockfile version",
    Number.isInteger(packageLock?.lockfileVersion) && packageLock.lockfileVersion >= 2,
    `Expected lockfileVersion 2 or newer; found ${String(packageLock?.lockfileVersion)}.`,
  );

  const root = packageLock?.packages?.[""];
  addCheck("lockfile root entry", Boolean(root && typeof root === "object"), 'package-lock.json must contain a packages[""] root entry.');

  if (!root || typeof root !== "object") {
    return { valid: false, checks, errors };
  }

  addCheck(
    "root package name",
    (packageJson?.name ?? null) === (root.name ?? null),
    `Package name differs: package.json=${String(packageJson?.name)}; lock root=${String(root.name)}.`,
  );
  addCheck(
    "root package version",
    (packageJson?.version ?? null) === (root.version ?? null),
    `Package version differs: package.json=${String(packageJson?.version)}; lock root=${String(root.version)}.`,
  );

  for (const section of dependencySections) {
    const manifestSpecs = packageJson?.[section] ?? {};
    const lockedSpecs = root[section] ?? {};
    const manifestNames = Object.keys(manifestSpecs).sort();
    const lockedNames = Object.keys(lockedSpecs).sort();
    const sameNames = JSON.stringify(manifestNames) === JSON.stringify(lockedNames);
    addCheck(
      `${section} keys`,
      sameNames,
      `${section} package names differ between package.json and package-lock.json root entry. Manifest-only: ${manifestNames.filter((name) => !(name in lockedSpecs)).join(", ") || "none"}; lock-only: ${lockedNames.filter((name) => !(name in manifestSpecs)).join(", ") || "none"}.`,
    );

    for (const name of manifestNames) {
      if (manifestSpecs[name] !== lockedSpecs[name]) {
        addCheck(
          `${section}:${name} spec`,
          false,
          `${section}.${name} differs: package.json=${String(manifestSpecs[name])}; package-lock.json=${String(lockedSpecs[name])}.`,
        );
        continue;
      }
      const entryPath = `node_modules/${name}`;
      const entry = packageLock?.packages?.[entryPath];
      const hasEntry = Boolean(entry && typeof entry === "object");
      addCheck(
        `${section}:${name} lock entry`,
        hasEntry,
        hasEntry ? "" : `Missing package-lock.json packages[${JSON.stringify(entryPath)}] for direct dependency ${name}.`,
      );
      if (hasEntry && !entry.link) {
        const hasVersion = typeof entry.version === "string" && entry.version.length > 0;
        addCheck(
          `${section}:${name} locked version`,
          hasVersion,
          hasVersion ? "" : `Lock entry for ${name} does not include a resolved version.`,
        );
      }
    }
  }

  return { valid: errors.length === 0, checks, errors };
}

async function main() {
  const [packageText, lockText] = await Promise.all([
    readFile(path.join(projectRoot, "package.json"), "utf8"),
    readFile(path.join(projectRoot, "package-lock.json"), "utf8"),
  ]);
  const result = inspectPackageLock(JSON.parse(packageText), JSON.parse(lockText));
  for (const check of result.checks) {
    console.log(`${check.valid ? "PASS" : "FAIL"} ${check.name}${!check.valid && check.message ? ` — ${check.message}` : ""}`);
  }
  console.log(`\nPackage-lock consistency: ${result.valid ? "PASS" : "FAIL"} (${result.checks.filter((check) => check.valid).length}/${result.checks.length} checks passed)`);
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`ERROR: ${error}`);
    console.error("This offline check does not replace npm ci; run npm ci after fixing manifest/lockfile drift.");
    process.exitCode = 1;
  } else {
    console.log("The manifest and lockfile root metadata are consistent. npm ci remains the authoritative install gate.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`Could not inspect package-lock consistency: ${error?.stack || error}`);
    process.exitCode = 1;
  });
}
