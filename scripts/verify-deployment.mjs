import path from "node:path";
import { pathToFileURL } from "node:url";

const ASSET_PATTERN = /(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/gi;

export async function verifyDeployment(baseUrl, fetchImpl = fetch) {
  let parsed;
  try { parsed = new URL(String(baseUrl ?? "")); }
  catch { throw new Error("STAGING_BASE_URL must be an absolute HTTP(S) URL."); }
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("STAGING_BASE_URL must use HTTP or HTTPS.");
  if (parsed.username || parsed.password) throw new Error("STAGING_BASE_URL must not contain credentials.");
  const rootUrl = parsed.toString().replace(/\/$/, "") + "/";
  const rootResponse = await fetchImpl(rootUrl, { redirect: "follow", headers: { accept: "text/html" } });
  if (!rootResponse.ok) throw new Error(`Deployment root returned HTTP ${rootResponse.status}.`);
  const contentType = rootResponse.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("text/html")) throw new Error("Deployment root did not return HTML content.");
  const html = await rootResponse.text();
  if (!/<html[\s>]/i.test(html) || !/<(?:div|main)[^>]+id=["']root["']/i.test(html)) {
    throw new Error("Deployment root is missing the expected HTML document or React root element.");
  }
  const assets = [...html.matchAll(ASSET_PATTERN)].map((match) => match[1]).filter((value) => !value.startsWith("data:"));
  const uniqueAssets = [...new Set(assets)];
  if (!uniqueAssets.some((asset) => /\.js(?:\?|$)/i.test(asset))) throw new Error("Deployment HTML does not reference a JavaScript bundle.");
  if (!uniqueAssets.some((asset) => /\.css(?:\?|$)/i.test(asset))) throw new Error("Deployment HTML does not reference a CSS bundle.");
  const checkedAssets = [];
  for (const asset of uniqueAssets) {
    const assetUrl = new URL(asset, rootUrl);
    if (assetUrl.origin !== parsed.origin) continue;
    const response = await fetchImpl(assetUrl, { method: "GET", redirect: "follow" });
    if (!response.ok) throw new Error(`Deployment asset returned HTTP ${response.status}: ${assetUrl.pathname}`);
    checkedAssets.push({ path: assetUrl.pathname, status: response.status });
  }
  return { status: "passed", baseUrl: `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`, rootStatus: rootResponse.status, contentType, checkedAssetCount: checkedAssets.length, checkedAssets };
}

async function main() {
  const baseUrl = process.env.STAGING_BASE_URL;
  if (!baseUrl) throw new Error("Set STAGING_BASE_URL to the deployed staging or preview URL.");
  const report = await verifyDeployment(baseUrl);
  console.log("Sketchizi deployment verification passed.");
  console.log(JSON.stringify(report, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const fs = await import("node:fs/promises");
    await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, `\n## Deployment verification\n\n- Status: **${report.status}**\n- URL: ${report.baseUrl}\n- Root HTTP status: ${report.rootStatus}\n- Same-origin assets checked: ${report.checkedAssetCount}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(`Deployment verification failed: ${error.message}`); process.exitCode = 1; });
}
