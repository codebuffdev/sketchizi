import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

test("local runner executes the full Compose lifecycle against one persistent project configuration", { skip: process.platform === "win32" }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "sketchizi-compose-integration-"));
  const bin = join(root, "bin");
  const projectRoot = join(root, "projects");
  await mkdir(bin, { recursive: true });
  const logPath = join(root, "docker-args.log");
  const dockerPath = join(bin, "docker");
  const fakeDocker = [
    "#!/bin/sh",
    "if [ \"$1\" = \"info\" ]; then echo 27.0.3; exit 0; fi",
    "printf \"%s\\n\" \"$*\" >> \"$DOCKER_TEST_LOG\"",
    "printf \"fake docker output: %s\\n\" \"$*\"",
    "exit 0"
  ].join("\n");
  await writeFile(dockerPath, fakeDocker, "utf8");
  await chmod(dockerPath, 0o755);
  const portServer = createServer();
  await new Promise((resolve) => portServer.listen(0, "127.0.0.1", resolve));
  const port = portServer.address().port;
  await new Promise((resolve, reject) => portServer.close((error) => error ? reject(error) : resolve()));
  const runner = spawn(process.execPath, [new URL("../server/compose-runner.mjs", import.meta.url).pathname], {
    env: { ...process.env, COMPOSE_RUNNER_PORT: String(port), COMPOSE_RUNNER_ALLOWED_ORIGINS: "http://localhost:5173", PATH: bin + delimiter + process.env.PATH, DOCKER_TEST_LOG: logPath, TMPDIR: projectRoot },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let runnerOutput = "";
  runner.stdout.on("data", (chunk) => { runnerOutput += chunk.toString(); });
  runner.stderr.on("data", (chunk) => { runnerOutput += chunk.toString(); });
  t.after(async () => { runner.kill("SIGTERM"); await rm(root, { recursive: true, force: true }); });
  const origin = "http://localhost:5173";
  const base = "http://127.0.0.1:" + port;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (runner.exitCode !== null) throw new Error("Runner exited before ready: " + runnerOutput);
    try { const response = await fetch(base + "/health", { headers: { Origin: origin } }); if (response.ok) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.equal(ready, true, "Runner did not become ready: " + runnerOutput);
  const health = await (await fetch(base + "/health", { headers: { Origin: origin } })).json();
  assert.equal(health.docker.available, true);
  assert.equal(health.docker.serverVersion, "27.0.3");
  const composeYaml = "services:\n  web:\n    image: nginx:alpine\n";
  const actions = ["validate", "up", "ps", "logs", "down"];
  for (const action of actions) {
    const response = await fetch(base + "/api/compose", {
      method: "POST",
      headers: { Origin: origin, "content-type": "application/json" },
      body: JSON.stringify({ action, projectName: "integration-project", composeYaml })
    });
    const result = await response.json();
    assert.equal(response.status, 200, action + " failed: " + JSON.stringify(result));
    assert.equal(result.success, true, action + " should succeed");
    assert.equal(result.action, action);
  }
  const calls = (await readFile(logPath, "utf8")).trim().split("\n");
  assert.equal(calls.length, actions.length);
  for (const call of calls) {
    assert.match(call, /--project-directory/);
    assert.match(call, /sketchizi-compose-projects\/integration-project/);
    assert.match(call, /-p integration-project/);
    assert.match(call, /compose\.yaml/);
  }
  assert.match(calls[0], /config --quiet/);
  assert.match(calls[1], /up --detach --build/);
  assert.match(calls[2], /ps --all/);
  assert.match(calls[3], /logs --no-color --tail 200/);
  assert.match(calls[4], /down/);
});
