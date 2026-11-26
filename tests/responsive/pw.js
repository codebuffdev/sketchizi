// Resolves the repo's single Playwright install (e2e/package.json) so the
// responsive suite does not add a second framework or touch the root lockfile.
// Falls back to a root-level install if someone added one.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const roots = [path.resolve(here, "../../e2e"), path.resolve(here, "../..")];
const req = createRequire(import.meta.url);

function resolvePkg(name) {
  const manifest = req.resolve(`${name}/package.json`, { paths: roots });
  return path.dirname(manifest);
}

const dir = resolvePkg("@playwright/test");
const mod = await import(pathToFileURL(path.join(dir, "index.mjs")).href);

export const { test, expect, defineConfig, devices, chromium } = mod;
export const base = mod.test;
