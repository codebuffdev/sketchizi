import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Compose runner binds only to loopback and uses a fixed Docker Compose action allowlist", async () => {
  const source = await readFile(new URL("../server/compose-runner.mjs", import.meta.url), "utf8");
  assert.match(source, /const HOST = "127\.0\.0\.1"/);
  assert.match(source, /const ACTIONS = new Set\(\["validate", "up", "down", "ps", "logs", "stats"\]\)/);
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
  assert.match(source, /stats: \["stats", "--no-stream", "--format", "json"\]/);
  assert.match(source, /ps: \["ps", "--all", "--format", "json"\]/);
});

test("Compose runner persists each project's Compose file so lifecycle actions share the same configuration path", async () => {
  const source = await readFile(new URL("../server/compose-runner.mjs", import.meta.url), "utf8");
  assert.match(source, /sketchizi-compose-projects/);
  assert.match(source, /writeFile\(join\(projectDirectory, "compose\.yaml"\)/);
  assert.doesNotMatch(source, /mkdtemp|rm\(temporaryDirectory/);
});

test("Compose runner health check distinguishes Docker CLI and daemon availability", async () => {
  const source = await readFile(new URL("../server/compose-runner.mjs", import.meta.url), "utf8");
  assert.match(source, /spawn\("docker", \["info", "--format"/);
  assert.match(source, /Docker CLI was not found/);
  assert.match(source, /Docker daemon is unavailable/);
  assert.match(source, /serverVersion/);
});

test("Studio exposes an explicit runner connectivity check and reports Docker health", async () => {
  const source = await readFile(new URL("../src/features/docker-compose/ui/DockerComposeStudio.jsx", import.meta.url), "utf8");
  assert.match(source, /checkRunnerHealth/);
  assert.match(source, /Check runner/);
  assert.match(source, /runComposeAction\("stats"\)/);
  assert.match(source, /Resource usage/);
  assert.match(source, /parseComposeStatus/);
  assert.match(source, /docker-studio-status-table/);
  assert.match(source, /Docker daemon available/);
});

test("Studio accurately explains that lifecycle actions execute through the local runner", async () => {
  const source = await readFile(new URL("../src/features/docker-compose/ui/DockerComposeStudio.jsx", import.meta.url), "utf8");
  assert.match(source, /Commands run through the local loopback runner on this machine/);
  assert.doesNotMatch(source, /Sketchizi does not execute Docker commands from this screen/);
  assert.match(source, /Start containers for this Compose project on your machine/);
  assert.match(source, /Stop and remove this Compose project/);
});
