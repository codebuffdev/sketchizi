import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { extractDockerFailureEvidence } from "./docker-failure-evidence.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.COMPOSE_RUNNER_PORT || 8788);
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const ACTION_TIMEOUT_MS = { validate: 20_000, ps: 15_000, stats: 15_000, logs: 15_000, down: 60_000, up: 120_000 };
const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;
const ALLOWED_ORIGINS = new Set([
  "https://sketchizi.pages.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...(process.env.COMPOSE_RUNNER_ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean),
]);
const ACTIONS = new Set(["validate", "up", "down", "ps", "logs", "stats"]);

function send(response, status, payload, origin) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": origin,
    "vary": "Origin",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > MAX_BODY_BYTES) throw Object.assign(new Error("Request body exceeds 2 MiB."), { status: 413 });
  }
  try { return JSON.parse(body); } catch { throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 }); }
}

function appendBounded(current, chunk) {
  const next = current + chunk.toString();
  return next.length > 200_000 ? next.slice(-200_000) : next;
}

function classifyDockerFailure(exitCode, stdout, stderr) {
  const output = (stderr + "\n" + stdout).toLowerCase();
  if (exitCode === 127 || /docker cli was not found|enoent/.test(output)) {
    return { errorCode: "DOCKER_CLI_MISSING", hint: "Install Docker Desktop, start it, and ensure the docker CLI is available on PATH." };
  }
  if (exitCode === 124 || /command timed out after/.test(output)) {
    return { errorCode: "COMMAND_TIMEOUT", hint: "The command exceeded its action-specific time limit. For start/stop actions, the final Docker state may be uncertain: use Status or Refresh status before retrying to avoid repeating a lifecycle action." };
  }
  if (/cannot connect to the docker daemon|daemon is not running|is the docker daemon running|error during connect/.test(output)) {
    return { errorCode: "DOCKER_DAEMON_UNAVAILABLE", hint: "Start Docker Desktop and wait until its engine is ready, then use Check runner." };
  }
  if (/port is already allocated|address already in use|bind:.*address/.test(output)) {
    return { errorCode: "PORT_CONFLICT", hint: "Another process may be using the published port. Change the host-side port in the Compose service and retry." };
  }
  if (/pull access denied|authentication required|unauthorized|denied: requested access/.test(output)) {
    return { errorCode: "IMAGE_ACCESS_DENIED", hint: "Check the image name, registry credentials, and whether your account can access the image." };
  }
  if (/no such file or directory.*dockerfile|failed to read dockerfile|dockerfile.*not found/.test(output)) {
    return { errorCode: "DOCKERFILE_MISSING", hint: "Verify the build context and Dockerfile path for the affected service." };
  }
  if (/additional property .* is not allowed|validating .* additional properties|services\\..* must be/.test(output)) {
    return { errorCode: "COMPOSE_CONFIG_INVALID", hint: "Review the Compose service fields and run Validate before starting the project." };
  }
  if (/no space left on device/.test(output)) {
    return { errorCode: "DOCKER_DISK_FULL", hint: "Free disk space used by Docker images, containers, or build cache, then retry." };
  }
  return { errorCode: "COMPOSE_COMMAND_FAILED", hint: "Inspect the command output below. Fix the reported Compose, build, registry, or runtime issue and retry." };
}

function runDocker(args, cwd, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let stdout = "", stderr = "", settled = false;
    const child = spawn("docker", ["compose", ...args], { cwd, shell: false, windowsHide: true, env: { ...process.env, DOCKER_CLI_HINTS: "false" } });
    const finish = (result) => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
    const timer = setTimeout(() => { child.kill("SIGTERM"); finish({ exitCode: 124, timedOut: true, stdout, stderr: stderr + "\nCommand timed out after " + Math.round(timeoutMs / 1000) + " seconds." }); }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout = appendBounded(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = appendBounded(stderr, chunk); });
    child.on("error", (error) => finish({ exitCode: 127, stdout, stderr: error.code === "ENOENT" ? "Docker CLI was not found. Install Docker Desktop and ensure docker is on PATH." : error.message }));
    child.on("close", (code) => finish({ exitCode: code ?? 1, stdout, stderr }));
  });
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  if (!ALLOWED_ORIGINS.has(origin)) {
    send(response, 403, { error: "Origin is not allowed. Configure COMPOSE_RUNNER_ALLOWED_ORIGINS for your trusted Sketchizi origin." }, "null");
    return;
  }
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": origin,
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type",
      "access-control-max-age": "600",
      vary: "Origin",
    });
    response.end();
    return;
  }
  if (request.method === "GET" && request.url === "/health") {
    const docker = await new Promise((resolve) => {
      let settled = false;
      const child = spawn("docker", ["info", "--format", "{{.ServerVersion}}"], { shell: false, windowsHide: true, env: { ...process.env, DOCKER_CLI_HINTS: "false" } });
      let stdout = "";
      let stderr = "";
      const finish = (result) => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
      const timer = setTimeout(() => { child.kill("SIGTERM"); finish({ available: false, message: "Docker daemon did not respond within 8 seconds. Start Docker Desktop and retry." }); }, 8000);
      child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
      child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
      child.on("error", (error) => finish({ available: false, message: error.code === "ENOENT" ? "Docker CLI was not found. Install Docker Desktop and ensure docker is on PATH." : error.message }));
      child.on("close", (code) => finish(code === 0 ? { available: true, serverVersion: stdout.trim() } : { available: false, message: stderr.trim() || "Docker daemon is unavailable. Start Docker Desktop and retry." }));
    });
    send(response, 200, { ok: true, service: "sketchizi-compose-runner", host: HOST, actions: [...ACTIONS], docker }, origin);
    return;
  }
  if (request.method !== "POST" || request.url !== "/api/compose") {
    send(response, 404, { error: "Route not found." }, origin);
    return;
  }

  let projectDirectory;
  try {
    const body = await readJson(request);
    const action = body.action;
    if (!ACTIONS.has(action)) throw Object.assign(new Error("Unsupported action. Use validate, up, down, ps, logs, or stats."), { status: 400 });
    if (typeof body.composeYaml !== "string" || !body.composeYaml.trim()) throw Object.assign(new Error("composeYaml must contain the Compose YAML text."), { status: 400 });
    const document = parseDocument(body.composeYaml, { uniqueKeys: true });
    if (document.errors.length) throw Object.assign(new Error("Invalid YAML: " + document.errors[0].message), { status: 400 });
    const parsed = document.toJS();
    if (!parsed || typeof parsed !== "object" || !parsed.services || typeof parsed.services !== "object" || Array.isArray(parsed.services)) {
      throw Object.assign(new Error("Compose document must contain a services mapping."), { status: 400 });
    }
    const projectName = typeof body.projectName === "string" ? body.projectName.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48) : "";
    if (!projectName) throw Object.assign(new Error("projectName must contain letters, numbers, underscores, or hyphens."), { status: 400 });
    projectDirectory = join(tmpdir(), "sketchizi-compose-projects", projectName);
    await mkdir(projectDirectory, { recursive: true, mode: 0o700 });
    await writeFile(join(projectDirectory, "compose.yaml"), body.composeYaml, { encoding: "utf8", mode: 0o600 });
    const baseArgs = ["--project-directory", projectDirectory, "-p", projectName, "-f", join(projectDirectory, "compose.yaml")];
    let serviceName;
    if (body.serviceName !== undefined) {
      if (action !== "logs") throw Object.assign(new Error("serviceName is supported only for the logs action."), { status: 400 });
      if (typeof body.serviceName !== "string" || !/^[a-zA-Z0-9_.-]{1,63}$/.test(body.serviceName)) {
        throw Object.assign(new Error("serviceName must be a valid Compose service name."), { status: 400 });
      }
      if (!Object.hasOwn(parsed.services, body.serviceName)) {
        throw Object.assign(new Error("The requested service does not exist in this Compose document."), { status: 400 });
      }
      serviceName = body.serviceName;
    }
    const actionArgs = {
      validate: ["config", "--quiet"],
      up: ["up", "--detach", "--build"],
      down: ["down"],
      ps: ["ps", "--all", "--format", "json"],
      logs: ["logs", "--no-color", "--tail", "200"],
      stats: ["stats", "--no-stream", "--format", "json"],
    };
    const commandArgs = [...actionArgs[action], ...(action === "logs" && serviceName ? [serviceName] : [])];
    const result = await runDocker([...baseArgs, ...commandArgs], projectDirectory, ACTION_TIMEOUT_MS[action]);
    send(response, result.exitCode === 0 ? 200 : 422, {
      action, projectName, ...(serviceName ? { serviceName } : {}), exitCode: result.exitCode,
      success: result.exitCode === 0,
      stdout: result.stdout.slice(-200_000),
      stderr: result.stderr.slice(-200_000),
      message: result.exitCode === 0 ? "Docker Compose command completed." : result.timedOut ? "Docker Compose command timed out. Its final state may be unknown; check Status before retrying." : "Docker Compose command failed.",
      ...(result.timedOut ? { timedOut: true } : {}),
      ...(result.exitCode === 0 ? {} : classifyDockerFailure(result.exitCode, result.stdout, result.stderr)),
      ...(result.exitCode === 0 ? {} : { failureEvidence: extractDockerFailureEvidence(result.stderr, result.stdout, Object.keys(parsed.services)) }),
    }, origin);
  } catch (error) {
    send(response, error.status || 500, { error: error.message || "Compose runner failed." }, origin);
  } finally {}
});

server.listen(PORT, HOST, () => {
  process.stdout.write("Sketchizi Compose runner listening on http://" + HOST + ":" + PORT + "\n");
});
