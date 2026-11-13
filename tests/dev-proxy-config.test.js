import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Vite local Pages-function defaults match the configured development port and backend ports", async () => {
  const vite = await readFile(new URL("../vite.config.js", import.meta.url), "utf8");
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(pkg.scripts.dev, /--port 3000/);
  assert.match(pkg.scripts.preview, /--port 3000/);
  assert.match(vite, /host:\s*"localhost:3000"/);
  assert.match(vite, /AUTH_SERVICE_ORIGIN:[^\n]*http:\/\/localhost:8080/);
  assert.match(vite, /AI_SERVICE_ORIGIN:[^\n]*http:\/\/localhost:8090/);
  assert.match(vite, /PUBLIC_FRONTEND_ORIGIN:[^\n]*http:\/\/localhost:3000/);
  assert.match(vite, /AI_IDENTITY_HMAC_SECRET:[^\n]*process\.env\.AI_IDENTITY_HMAC_SECRET \|\| ""/);
});

test("Git ignore rules retain environment, tooling, cache, build, and backend protection", async () => {
  const ignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
  for (const pattern of [".env", "!.env.example", ".wrangler", ".idea/", "**/target/", "coverage/", "tmp/", "artifacts/"]) {
    assert.ok(ignore.includes(pattern), `Missing .gitignore protection: ${pattern}`);
  }
});
