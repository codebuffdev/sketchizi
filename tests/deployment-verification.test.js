import test from "node:test";
import assert from "node:assert/strict";
import { verifyDeployment } from "../scripts/verify-deployment.mjs";

function response(body, status = 200, contentType = "text/html; charset=utf-8") {
  return { ok: status >= 200 && status < 300, status, headers: { get: (name) => name.toLowerCase() === "content-type" ? contentType : null }, text: async () => body };
}
const html = '<!doctype html><html><head><link href="/assets/app.css" rel="stylesheet"><script type="module" src="/assets/app.js"></script></head><body><div id="root"></div></body></html>';

test("deployment verification checks HTML root and same-origin JS/CSS assets", async () => {
  const calls = [];
  const report = await verifyDeployment("https://staging.example.test/", async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method ?? "GET" });
    if (String(url).endsWith("/")) return response(html);
    return response("asset", 200, String(url).endsWith(".css") ? "text/css" : "text/javascript");
  });
  assert.equal(report.status, "passed");
  assert.equal(report.checkedAssetCount, 2);
  assert.equal(calls.length, 3);
});

test("deployment verification rejects non-HTTP URLs and credentials in URL", async () => {
  await assert.rejects(() => verifyDeployment("file:///tmp/site"), /HTTP or HTTPS/);
  await assert.rejects(() => verifyDeployment("https://user:secret@example.test"), /must not contain credentials/);
});

test("deployment verification fails when root or a referenced asset is unhealthy", async () => {
  await assert.rejects(() => verifyDeployment("https://staging.example.test", async () => response("down", 503)), /HTTP 503/);
  await assert.rejects(() => verifyDeployment("https://staging.example.test", async (url) => String(url).endsWith("/") ? response(html) : response("missing", 404)), /asset returned HTTP 404/);
});

test("deployment verification rejects HTML without expected app root or bundles", async () => {
  await assert.rejects(() => verifyDeployment("https://staging.example.test", async () => response('<html><body><div id="other"></div></body></html>')), /missing the expected HTML/);
  await assert.rejects(() => verifyDeployment("https://staging.example.test", async () => response('<html><body><div id="root"></div></body></html>')), /JavaScript bundle/);
});
