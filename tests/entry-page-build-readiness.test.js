import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

async function readProjectFile(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("HTML entry point configures Excalidraw assets before loading the app", async () => {
  const html = await readProjectFile("index.html");
  const assetPathIndex = html.indexOf('window.EXCALIDRAW_ASSET_PATH = "/"');
  const appModuleIndex = html.indexOf('src="/src/main.jsx"');

  assert.notEqual(assetPathIndex, -1, "Excalidraw assets must be served from the site root");
  assert.notEqual(appModuleIndex, -1, "the Vite app entry module must exist");
  assert.ok(assetPathIndex < appModuleIndex, "asset path must be configured before app initialization");
  assert.match(html, /<div id="root"><\/div>/, "React mount point must exist");
});

test("HTML entry point retains public-site metadata and app shell links", async () => {
  const html = await readProjectFile("index.html");
  assert.match(html, /<title>Sketchizi/);
  assert.match(html, /name="description"/);
  assert.match(html, /rel="canonical"/);
  assert.match(html, /rel="manifest"/);
  assert.match(html, /rel="icon"/);
});

test("dev and production scripts run the pinned Excalidraw font-copy preflight", async () => {
  const pkg = JSON.parse(await readProjectFile("package.json"));
  assert.equal(pkg.scripts.predev, "node scripts/copy-excalidraw-fonts.mjs");
  assert.equal(pkg.scripts.prebuild, "node scripts/copy-excalidraw-fonts.mjs");
  assert.equal(pkg.dependencies["@excalidraw/excalidraw"], "0.18.0-c0ad61c");
});

test("production build command and Vite dependency are declared", async () => {
  const pkg = JSON.parse(await readProjectFile("package.json"));
  assert.equal(pkg.scripts.build, "vite build");
  assert.ok(pkg.devDependencies.vite, "Vite must be declared as a development dependency");
  assert.ok(pkg.dependencies.react && pkg.dependencies["react-dom"], "React runtime dependencies must be declared");
});
