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
  assert.match(source, /ACTION_TIMEOUT_MS = \{ validate: 20_000, ps: 15_000, stats: 15_000, logs: 15_000, down: 60_000, up: 120_000 \}/);
  assert.match(source, /DEFAULT_COMMAND_TIMEOUT_MS = 120_000/);
  assert.match(source, /runDocker\(\[\.\.\.baseArgs, \.\.\.actionArgs\[action\]\], projectDirectory, ACTION_TIMEOUT_MS\[action\]\)/);
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

test("Compose runner bounds captured output without killing diagnostics", async () => {
  const source = await readFile(new URL("../server/compose-runner.mjs", import.meta.url), "utf8");
  assert.ok(source.includes("function appendBounded(current, chunk)"));
  assert.ok(source.includes("next.slice(-200_000)"));
  assert.ok(source.includes("stdout = appendBounded(stdout, chunk)"));
  assert.ok(source.includes("stderr = appendBounded(stderr, chunk)"));
  assert.ok(!source.includes("stdout.length > 200_000) child.kill"));
});

test("Studio summarizes container health and distinguishes runtime states", async () => {
  const source = await readFile(new URL("../src/features/docker-compose/ui/DockerComposeStudio.jsx", import.meta.url), "utf8");
  for (const state of ["Healthy", "Running", "Starting", "Unhealthy", "Stopped", "Unknown"]) assert.ok(source.includes(state), "missing state: " + state);
  assert.ok(source.includes("function summarizeContainers(containers)"));
  assert.ok(source.includes("docker-studio-container-summary"));
  assert.ok(source.includes("container.HealthStatus"));
});


test("Compose runner classifies common failures and returns actionable remediation hints", async () => {
  const source = await readFile(new URL("../server/compose-runner.mjs", import.meta.url), "utf8");
  for (const code of ["DOCKER_CLI_MISSING", "COMMAND_TIMEOUT", "DOCKER_DAEMON_UNAVAILABLE", "PORT_CONFLICT", "IMAGE_ACCESS_DENIED", "DOCKERFILE_MISSING", "COMPOSE_CONFIG_INVALID", "DOCKER_DISK_FULL", "COMPOSE_COMMAND_FAILED"]) {
    assert.ok(source.includes(code), "missing diagnostic classification: " + code);
  }
  assert.match(source, /classifyDockerFailure\(result\.exitCode, result\.stdout, result\.stderr\)/);
  assert.match(source, /hint: "Start Docker Desktop/);
  assert.match(source, /hint: "Another process may be using the published port/);
});

test("Studio renders stable error codes and remediation hints alongside raw command output", async () => {
  const source = await readFile(new URL("../src/features/docker-compose/ui/DockerComposeStudio.jsx", import.meta.url), "utf8");
  assert.match(source, /docker-studio-actionable-diagnostic/);
  assert.match(source, /runnerResult\.errorCode/);
  assert.match(source, /runnerResult\.hint/);
  assert.match(source, /runnerResult\.stdout/);
});


test("Studio refreshes runtime status after successful start and stop without repeating lifecycle actions", async () => {
  const source = await readFile(new URL("../src/features/docker-compose/ui/DockerComposeStudio.jsx", import.meta.url), "utf8");
  assert.match(source, /Runtime status refreshed/);
  assert.match(source, /refreshWarning/);
  assert.match(source, /action: "ps", projectName, composeYaml: stringify\(getExportDocument\(\)\)/);
  assert.match(source, /Refresh status/);
  assert.match(source, /Use Status or Refresh status to retry without repeating the lifecycle action/);
});

test("Compose runner marks timeout outcomes as uncertain and advises checking status before retrying", async () => {
  const source = await readFile(new URL("../server/compose-runner.mjs", import.meta.url), "utf8");
  assert.match(source, /timedOut: true/);
  assert.match(source, /final state may be unknown; check Status before retrying/);
  assert.match(source, /For start\/stop actions, the final Docker state may be uncertain/);
  assert.match(source, /action-specific time limit/);
});

test("Studio exposes lifecycle output and treats unconfirmed requests as uncertain outcomes", async () => {
  const source = await readFile(new URL("../src/features/docker-compose/ui/DockerComposeStudio.jsx", import.meta.url), "utf8");
  assert.match(source, /runnerResult\.lifecycleOutput/);
  assert.match(source, /Lifecycle output/);
  assert.match(source, /runnerResult\.outcomeUnknown/);
  assert.match(source, /Outcome uncertain/);
  assert.match(source, /Check Status before retrying a lifecycle action/);
  assert.match(source, /CHECK BEFORE RETRYING/);
});
