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
  assert.match(source, /const commandArgs = \[\.\.\.actionArgs\[action\], \.\.\.\(action === "logs" && serviceName \? \[serviceName\] : \[\]\)\]/);
  assert.match(source, /runDocker\(\[\.\.\.baseArgs, \.\.\.commandArgs\], projectDirectory, ACTION_TIMEOUT_MS\[action\]\)/);
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



test("Compose runner bounds captured output without killing diagnostics", async () => {
  const source = await readFile(new URL("../server/compose-runner.mjs", import.meta.url), "utf8");
  assert.ok(source.includes("function appendBounded(current, chunk)"));
  assert.ok(source.includes("next.slice(-200_000)"));
  assert.ok(source.includes("stdout = appendBounded(stdout, chunk)"));
  assert.ok(source.includes("stderr = appendBounded(stderr, chunk)"));
  assert.ok(!source.includes("stdout.length > 200_000) child.kill"));
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




test("Compose runner marks timeout outcomes as uncertain and advises checking status before retrying", async () => {
  const source = await readFile(new URL("../server/compose-runner.mjs", import.meta.url), "utf8");
  assert.match(source, /timedOut: true/);
  assert.match(source, /final state may be unknown; check Status before retrying/);
  assert.match(source, /For start\/stop actions, the final Docker state may be uncertain/);
  assert.match(source, /action-specific time limit/);
});





test("Compose runner scopes log requests to a declared service and rejects invalid service targets", async () => {
  const source = await readFile(new URL("../server/compose-runner.mjs", import.meta.url), "utf8");
  assert.match(source, /serviceName is supported only for the logs action/);
  assert.match(source, /valid Compose service name/);
  assert.match(source, /Object\.hasOwn\(parsed\.services, body\.serviceName\)/);
  assert.match(source, /action === "logs" && serviceName \? \[serviceName\] : \[\]/);
  assert.match(source, /serviceName \? \{ serviceName \} : \{\}/);
});








test("Compose runner passes declared service definitions to dependency-aware failure attribution", async () => {
  const source = await readFile(new URL("../server/compose-runner.mjs", import.meta.url), "utf8");
  assert.match(source, /extractDockerFailureEvidence\(result\.stderr, result\.stdout, parsed\.services\)/);
});

test("Compose runner attaches service-specific remediation guidance to failures", async () => {
  const source = await readFile(new URL("../server/compose-runner.mjs", import.meta.url), "utf8");
  assert.match(source, /getServiceFailureRemediation\(/);
  assert.match(source, /failureRemediation:/);
});


test("Compose runner validates dependency references and cycles before validate or up execution", async () => {
  const source = await readFile(new URL("../server/compose-runner.mjs", import.meta.url), "utf8");
  assert.match(source, /validateComposeDependencies\(parsed\.services\)/);
  assert.match(source, /action === "validate" \|\| action === "up"/);
  assert.match(source, /COMPOSE_DEPENDENCY_INVALID/);
  assert.match(source, /configurationDiagnostics: dependencyValidation\.diagnostics/);
  assert.ok(source.indexOf("validateComposeDependencies(parsed.services)") < source.indexOf('await writeFile(join(projectDirectory, "compose.yaml")'));
});



test("Compose Studio stays focused on design-time import, validation, diagramming, and export", async () => {
  const source = await readFile(new URL("../src/features/docker-compose/ui/DockerComposeStudio.jsx", import.meta.url), "utf8");
  assert.match(source, /Import YAML/);
  assert.match(source, /Create diagram/);
  assert.match(source, /Export YAML/);
  assert.match(source, /const exportReport/);
  assert.doesNotMatch(source, /Execution Preflight|Deployment preflight|Start services|Stop services|Local runner URL|runnerUrl/);
});
