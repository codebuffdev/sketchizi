import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyExcalidrawFonts } from "../scripts/copy-excalidraw-fonts.mjs";
import { parseDrawing, serializeDrawing } from "../src/fileSystem.js";

const root = fileURLToPath(new URL("..", import.meta.url));

test("Excalidraw's font asset path is configured before the app module loads", async () => {
  const html = await readFile(path.join(root, "index.html"), "utf8");
  const assetPathIndex = html.indexOf('window.EXCALIDRAW_ASSET_PATH = "/"');
  const appModuleIndex = html.indexOf('src="/src/main.jsx"');
  assert.notEqual(assetPathIndex, -1, "the app self-hosts Excalidraw fonts at the site root");
  assert.notEqual(appModuleIndex, -1, "the Vite app entry exists");
  assert.ok(assetPathIndex < appModuleIndex, "the asset path must be set before Excalidraw initializes");
});

test("dev and production build copy fonts from the pinned Excalidraw package", async () => {
  const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.equal(pkg.version, "1.10.77");
  assert.equal(pkg.scripts.predev, "node scripts/copy-excalidraw-fonts.mjs");
  assert.equal(pkg.scripts.prebuild, "node scripts/copy-excalidraw-fonts.mjs");
  const script = await readFile(path.join(root, "scripts/copy-excalidraw-fonts.mjs"), "utf8");
  assert.match(script, /node_modules/);
  assert.match(script, /@excalidraw/);
  assert.match(script, /dist[\\"']?,?\s*\n?\s*[\\"']prod[\\"']?/);
  assert.match(script, /public/);
});

test("font copy helper preserves family folders and font files", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sketchizi-font-assets-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const source = path.join(temp, "package", "fonts");
  const destination = path.join(temp, "public", "fonts");
  const fontPath = path.join(source, "ComicShanns", "ComicShanns-Regular-test.woff2");
  await mkdir(path.dirname(fontPath), { recursive: true });
  await writeFile(fontPath, Buffer.from([0, 1, 2, 3]));

  await copyExcalidrawFonts(source, destination);
  await access(path.join(destination, "ComicShanns", "ComicShanns-Regular-test.woff2"));
  assert.deepEqual(
    await readFile(path.join(destination, "ComicShanns", "ComicShanns-Regular-test.woff2")),
    Buffer.from([0, 1, 2, 3]),
  );
});

test("font copy helper fails clearly when Excalidraw assets are missing", async (t) => {
  const temp = await mkdtemp(path.join(os.tmpdir(), "sketchizi-font-assets-missing-"));
  t.after(() => rm(temp, { recursive: true, force: true }));
  await assert.rejects(
    copyExcalidrawFonts(path.join(temp, "no-fonts"), path.join(temp, "public", "fonts")),
    /Run npm ci before starting or building Sketchizi/,
  );
});


test("supported non-default fontFamily values and other text properties survive save/reload serialization", () => {
  const fontFamilies = [
    { name: "Excalifont", id: 5 },
    { name: "Nunito", id: 6 },
    { name: "Lilita One", id: 7 },
    { name: "Comic Shanns", id: 8 },
  ];
  const elements = fontFamilies.map(({ name, id }, index) => ({
    id: `font-${index}`,
    type: "text",
    x: 20 + index * 40,
    y: 30,
    width: 160,
    height: 28,
    text: `Font sample ${name}`,
    originalText: `Font sample ${name}`,
    fontFamily: id,
    fontSize: 20 + index,
    textAlign: "left",
    verticalAlign: "top",
    strokeColor: "#123456",
    opacity: 87,
    version: 2,
    versionNonce: 500 + index,
  }));
  const json = serializeDrawing({ elements, appState: {}, files: {} });
  const restored = parseDrawing(json);
  assert.deepEqual(restored.elements, elements);
});
