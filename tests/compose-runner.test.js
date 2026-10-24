import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Compose runner binds only to loopback and uses a fixed Docker Compose action allowlist", async () => {
  const source = await readFile(new URL("../server/compose-runner.mjs", import.meta.url), "utf8");
  assert.match(source, /const HOST = "127\.0\.0\.1"/);
  assert.match(source, /const ACTIONS = new Set\(\["validate", "up", "down", "ps", "logs"\]\)/);
  assert.match(source, /spawn\("docker", \["compose", \.\.\.args\]/);
  assert.match(source, /shell: false/);
  assert.match(source, /MAX_BODY_BYTES = 2 \* 1024 \* 1024/);
  assert.match(source, /COMMAND_TIMEOUT_MS = 120_000/);
  assert.match(source, /parseDocument\(body\.composeYaml, \{ uniqueKeys: true \}\)/);
  assert.match(source, /ALLOWED_ORIGINS\.has\(origin\)/);
});

test("Compose runner validates project names and Compose services before executing Docker", async () => {
  const source = await readFile(new URL("../server/compose-runner.mjs", import.meta.url), "utf8");
  assert.match(source, /Compose document must contain a services mapping/);
  assert.match(source, /projectName must contain letters, numbers, underscores, or hyphens/);
  assert.match(source, /actionArgs/);
  assert.match(source, /validate: \["config", "--quiet"\]/);
  assert.match(source, /up: \["up", "--detach", "--build"\]/);
});
