import test from "node:test";
import assert from "node:assert/strict";
import { createComposeDocument, validateComposeDocument, exportComposeYaml } from "../src/features/docker-compose/composeDocumentService.js";

test("creates a normalized Compose document without mutating its input", () => {
  const source = { name: "shop", services: { api: { image: "node:22" } } };
  const document = createComposeDocument(source);
  document.services.api.image = "node:24";
  assert.equal(source.services.api.image, "node:22");
  assert.deepEqual(document.volumes, {});
  assert.deepEqual(document.networks, {});
});

test("requires at least one service and image or build for each service", () => {
  assert.ok(validateComposeDocument({}).findings.some((finding) => finding.code === "COMPOSE_NO_SERVICES"));
  const result = validateComposeDocument({ services: { api: { ports: ["8080:80"] } } });
  assert.ok(result.findings.some((finding) => finding.code === "COMPOSE_MISSING_IMAGE_OR_BUILD"));
  assert.equal(result.valid, false);
});

test("validates dependency references and named networks", () => {
  const result = validateComposeDocument({
    services: {
      api: { image: "example/api:1", depends_on: ["database"], networks: ["backend"] },
    },
  });
  assert.ok(result.findings.some((finding) => finding.code === "COMPOSE_UNKNOWN_DEPENDENCY"));
  assert.ok(result.findings.some((finding) => finding.code === "COMPOSE_UNKNOWN_NETWORK"));
});

test("validates restart policy and warns about undeclared named volumes", () => {
  const result = validateComposeDocument({
    services: {
      api: { image: "example/api:1", restart: "sometimes", volumes: ["dbdata:/var/lib/app"] },
    },
  });
  assert.ok(result.findings.some((finding) => finding.code === "COMPOSE_INVALID_RESTART_POLICY"));
  assert.ok(result.findings.some((finding) => finding.code === "COMPOSE_UNKNOWN_VOLUME"));
});

test("exports a deterministic Compose YAML document with quoted scalar values", () => {
  const yaml = exportComposeYaml({
    name: "shop",
    services: { api: { image: "example/api:1", restart: "unless-stopped", ports: ["8080:80"] } },
    volumes: { data: {} },
  });
  assert.match(yaml, /name: "shop"/);
  assert.match(yaml, /image: "example\/api:1"/);
  assert.match(yaml, /restart: "unless-stopped"/);
  assert.match(yaml, /ports:\n\s+- "8080:80"/);
  assert.match(yaml, /volumes:\n\s+data: \{\}/);
});

test("preserves build context, mounted volumes, networks, and health checks in exported YAML", () => {
  const yaml = exportComposeYaml({
    name: "web-stack",
    services: {
      api: {
        build: { context: "." },
        volumes: ["data:/var/lib/data"],
        networks: ["backend"],
        healthcheck: { test: ["CMD-SHELL", "curl -f http://localhost/health"], interval: "30s", retries: 3 },
      },
    },
    volumes: { data: {} },
    networks: { backend: {} },
  });
  assert.match(yaml, /build:\\n\\s+context: "\\."/);
  assert.match(yaml, /volumes:\\n\\s+- "data:\/var\/lib\/data"/);
  assert.match(yaml, /networks:\\n\\s+- "backend"/);
  assert.match(yaml, /healthcheck:/);
  assert.match(yaml, /interval: "30s"/);
  assert.match(yaml, /retries: 3/);
});
