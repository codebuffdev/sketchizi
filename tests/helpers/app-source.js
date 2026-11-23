import { readFileSync, readdirSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";

/**
 * Several source-contract tests assert on code that used to live inline in
 * src/App.jsx. Logic extracted into src/hooks/*.js is still App's behavior, so
 * these helpers return App.jsx followed by every hook file. Assertions keep
 * their exact wording; only the place the text is searched has widened.
 */
const appUrl = new URL("../../src/App.jsx", import.meta.url);
const hooksUrl = new URL("../../src/hooks/", import.meta.url);
const hookFiles = (names) => names.filter((name) => /\.jsx?$/.test(name)).sort();

export function readAppSourceSync() {
  let names = [];
  try { names = hookFiles(readdirSync(hooksUrl)); } catch { /* no hooks directory yet */ }
  return [readFileSync(appUrl, "utf8"), ...names.map((name) => readFileSync(new URL(name, hooksUrl), "utf8"))].join("\n");
}

export async function readAppSource() {
  let names = [];
  try { names = hookFiles(await readdir(hooksUrl)); } catch { /* no hooks directory yet */ }
  const parts = await Promise.all([readFile(appUrl, "utf8"), ...names.map((name) => readFile(new URL(name, hooksUrl), "utf8"))]);
  return parts.join("\n");
}
