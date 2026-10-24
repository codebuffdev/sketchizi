import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getComposeRecoveryGuidance } from "../src/features/docker-compose/recoveryGuidance.js";

const EXPECTED_CODES = [
  "DOCKER_CLI_MISSING",
  "DOCKER_DAEMON_UNAVAILABLE",
  "PORT_CONFLICT",
  "IMAGE_ACCESS_DENIED",
  "DOCKERFILE_MISSING",
  "COMPOSE_CONFIG_INVALID",
  "COMMAND_TIMEOUT",
  "DOCKER_DISK_FULL",
  "COMPOSE_COMMAND_FAILED",
];

test("known Compose runner errors receive actionable recovery guidance and safe follow-up actions", () => {
  for (const code of EXPECTED_CODES) {
    const guidance = getComposeRecoveryGuidance(code, "up", "api");
    assert.ok(guidance, `missing guidance for ${code}`);
    assert.ok(guidance.title.length > 0);
    assert.ok(guidance.steps.length >= 2);
    assert.ok(guidance.risk.length > 0);
    assert.ok(guidance.scope.includes("api"));
    assert.ok(["health", "validate", "ps", "logs"].includes(guidance.action), `unsafe follow-up action for ${code}`);
    assert.ok(guidance.actionLabel.length > 0);
  }
});

test("unknown runner errors do not produce guessed recovery steps", () => {
  assert.equal(getComposeRecoveryGuidance("SOME_FUTURE_ERROR", "up", "web"), null);
  assert.equal(getComposeRecoveryGuidance(undefined, "up"), null);
});

test("timeout recovery checks runtime status before repeating lifecycle commands", () => {
  const guidance = getComposeRecoveryGuidance("COMMAND_TIMEOUT", "up");
  assert.equal(guidance.action, "ps");
  assert.ok(guidance.steps.some((step) => /Status|Refresh status/.test(step)));
  assert.match(guidance.risk, /does not prove Start or Stop failed/);
});

test("storage recovery warns against broad pruning and volume deletion", () => {
  const guidance = getComposeRecoveryGuidance("DOCKER_DISK_FULL", "up");
  assert.equal(guidance.action, "ps");
  assert.match(guidance.steps.join(" "), /Avoid broad prune or volume deletion/);
  assert.match(guidance.risk, /permanently delete data/);
});

test("service context is included in recovery scope and guidance does not permit destructive actions", () => {
  const guidance = getComposeRecoveryGuidance("PORT_CONFLICT", "up", "gateway");
  assert.match(guidance.scope, /for service “gateway”/);
  assert.doesNotMatch(guidance.action, /down|remove|delete|prune|restart/);
  assert.match(guidance.risk, /Do not stop unrelated containers/);
});

test("Compose Studio excludes runtime recovery UI while retaining static configuration reports", async () => {
  const ui = await readFile(new URL("../src/features/docker-compose/ui/DockerComposeStudio.jsx", import.meta.url), "utf8");
  assert.match(ui, /downloadPreflightReport/);
  assert.match(ui, /exportComposeReadinessReport/);
  assert.doesNotMatch(ui, /getComposeRecoveryGuidance|Copy diagnostic report|Start services|Stop services|runnerResult/);
});
