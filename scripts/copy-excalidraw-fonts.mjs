import { access, cp, mkdir, rm, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Copy the font assets from the exact installed Excalidraw package into Vite's
 * public directory. This avoids relying on a separately deployed Excalidraw
 * CDN whose generated font filenames may not match the pinned package build.
 */
export async function copyExcalidrawFonts(sourceDirectory, destinationDirectory) {
  try {
    await access(sourceDirectory);
  } catch {
    throw new Error(
      `Excalidraw font assets were not found at ${sourceDirectory}. Run npm ci before starting or building Sketchizi.`,
    );
  }

  const sourceEntries = await readdir(sourceDirectory, { withFileTypes: true });
  const hasFontAssets = sourceEntries.some((entry) => entry.isDirectory())
    || sourceEntries.some((entry) => /\.(woff2?|ttf|otf)$/i.test(entry.name));
  if (!hasFontAssets) {
    throw new Error(`Excalidraw font asset directory is empty: ${sourceDirectory}`);
  }

  await rm(destinationDirectory, { recursive: true, force: true });
  await mkdir(path.dirname(destinationDirectory), { recursive: true });
  await cp(sourceDirectory, destinationDirectory, { recursive: true, force: true });

  return { sourceDirectory, destinationDirectory, copiedEntries: sourceEntries.length };
}

async function run() {
  const source = path.join(
    projectRoot,
    "node_modules",
    "@excalidraw",
    "excalidraw",
    "dist",
    "prod",
    "fonts",
  );
  const destination = path.join(projectRoot, "public", "fonts");
  const result = await copyExcalidrawFonts(source, destination);
  console.log(
    `[sketchizi-fonts] Copied ${result.copiedEntries} font asset entries from the installed Excalidraw package to public/fonts.`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  run().catch((error) => {
    console.error(`[sketchizi-fonts] ${error.message}`);
    process.exitCode = 1;
  });
}
