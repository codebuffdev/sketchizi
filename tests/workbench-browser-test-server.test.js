import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createWorkbenchBrowserTestServer } from "../scripts/workbench-browser-test-server.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function withServer(callback) {
  const server = createWorkbenchBrowserTestServer({ root: projectRoot });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("browser verification server serves the smoke page without caching", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/tests/browser/workbench-persistence-smoke.html`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.match(await response.text(), /workbench-persistence-smoke\.js/);
  });
});

test("browser verification server accepts a result and exposes it to the PowerShell runner", async () => {
  await withServer(async (baseUrl) => {
    const before = await fetch(`${baseUrl}/__status`).then((response) => response.json());
    assert.deepEqual(before, { done: false, result: null });

    const post = await fetch(`${baseUrl}/__result`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({ status: "passed", results: ["PASS first", "PASS second"] }),
    });
    assert.equal(post.status, 200);

    const after = await fetch(`${baseUrl}/__status`).then((response) => response.json());
    assert.equal(after.done, true);
    assert.equal(after.result.status, "passed");
    assert.deepEqual(after.result.results, ["PASS first", "PASS second"]);
    assert.ok(typeof after.result.completedAt === "string");
  });
});

test("browser verification server rejects invalid result payloads and unsupported methods", async () => {
  await withServer(async (baseUrl) => {
    const invalid = await fetch(`${baseUrl}/__result`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({ status: "maybe", results: "not-an-array" }),
    });
    assert.equal(invalid.status, 400);

    const wrongMethod = await fetch(`${baseUrl}/__result`);
    assert.equal(wrongMethod.status, 405);
    assert.equal(wrongMethod.headers.get("allow"), "POST");
  });
});



test("browser verification server rejects result reports from other origins", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/__result`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://untrusted.example" },
      body: JSON.stringify({ status: "passed", results: ["fake pass"] }),
    });
    assert.equal(response.status, 403);
    const status = await fetch(`${baseUrl}/__status`).then((item) => item.json());
    assert.equal(status.done, false);
  });
});

test("browser verification server blocks path traversal", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/%2e%2e%2fpackage.json`);
    assert.equal(response.status, 403);
  });
});


test("browser smoke reports final browser assertions automatically", async () => {
  const { readFile } = await import("node:fs/promises");
  const smoke = await readFile(path.join(projectRoot, "tests", "browser", "workbench-persistence-smoke.js"), "utf8");
  assert.match(smoke, /fetch\("\/\__result"/);
  assert.match(smoke, /reportResult\(\{ status: "passed", results \}\)/);
  assert.match(smoke, /reportResult\(\{ status: "failed", results:/);
});
