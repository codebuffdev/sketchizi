import test from "node:test";
import assert from "node:assert/strict";
import { analyzeComposeReadiness, createComposeDocument, validateComposeDocument, exportComposeYaml } from "../src/features/docker-compose/composeDocumentService.js";

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
  assert.match(yaml, /build:/);
  assert.match(yaml, /context:/);
  assert.match(yaml, /volumes:\n\s+- "data:\/var\/lib\/data"/);
  assert.match(yaml, /networks:\n\s+- "backend"/);
  assert.match(yaml, /healthcheck:/);
  assert.match(yaml, /interval: "30s"/);
  assert.match(yaml, /retries: 3/);
});

test("validates undefined secrets and configs referenced by services", () => {
  const result = validateComposeDocument({
    services: {
      api: { image: "example/api:1", secrets: ["missing-secret"], configs: ["missing-config"] },
    },
  });
  assert.ok(result.findings.some((finding) => finding.code === "COMPOSE_UNKNOWN_SECRET"));
  assert.ok(result.findings.some((finding) => finding.code === "COMPOSE_UNKNOWN_CONFIG"));
});

test("validates invalid host ports and malformed healthcheck definitions", () => {
  const result = validateComposeDocument({
    services: {
      api: { image: "example/api:1", ports: ["8080:80", "70000:81"], healthcheck: { test: 42 } },
    },
  });
  assert.ok(result.findings.some((finding) => finding.code === "COMPOSE_HOST_PORT_OUT_OF_RANGE"));
  assert.ok(result.findings.some((finding) => finding.code === "COMPOSE_INVALID_HEALTHCHECK_TEST"));
});

test("preserves top-level secrets and configs during export", () => {
  const yaml = exportComposeYaml({
    services: { api: { image: "example/api:1", secrets: ["api_key"], configs: ["app_config"] } },
    secrets: { api_key: { external: true } },
    configs: { app_config: { file: "./app.conf" } },
  });
  assert.match(yaml, /secrets:/);
  assert.match(yaml, /api_key:/);
  assert.match(yaml, /configs:/);
  assert.match(yaml, /app_config:/);
});

test("readiness analysis orders dependencies before dependents", () => {
  const result = analyzeComposeReadiness({
    services: {
      web: { image: "nginx:alpine", depends_on: ["api"] },
      api: { image: "node:22", depends_on: ["database"] },
      database: { image: "postgres:17" },
    },
  });
  assert.deepEqual(result.startupOrder, ["database", "api", "web"]);
  assert.equal(result.ready, true);
  assert.equal(result.findings.length, 0);
});

test("readiness analysis identifies dependency cycles", () => {
  const result = analyzeComposeReadiness({
    services: {
      api: { image: "example/api:1", depends_on: ["database"] },
      database: { image: "postgres:17", depends_on: ["api"] },
    },
  });
  assert.equal(result.ready, false);
  assert.deepEqual(result.startupOrder, []);
  assert.ok(result.findings.some((finding) => finding.code === "COMPOSE_DEPENDENCY_CYCLE"));
});

test("readiness analysis flags host environment substitutions without defaults", () => {
  const result = analyzeComposeReadiness({
    services: { web: { image: "nginx:${IMAGE_TAG:-latest}", ports: ["${WEB_PORT}:80"] } },
  });
  assert.ok(result.findings.some((finding) => finding.code === "COMPOSE_HOST_VARIABLE_REVIEW" && finding.message.includes("WEB_PORT")));
  assert.equal(result.findings.some((finding) => finding.message.includes("IMAGE_TAG")), false);
});

test("readiness analysis warns when service_healthy has no dependency healthcheck", () => {
  const result = analyzeComposeReadiness({
    services: {
      api: { image: "example/api:1", depends_on: { database: { condition: "service_healthy" } } },
      database: { image: "postgres:17" },
    },
  });
  assert.ok(result.findings.some((finding) => finding.code === "COMPOSE_DEPENDENCY_HEALTHCHECK_MISSING"));
  assert.equal(result.startupOrder[0], "database");
});

test("readiness analysis accepts service_healthy when dependency defines a healthcheck", () => {
  const result = analyzeComposeReadiness({
    services: {
      api: { image: "example/api:1", depends_on: { database: { condition: "service_healthy" } } },
      database: { image: "postgres:17", healthcheck: { test: ["CMD", "pg_isready"] } },
    },
  });
  assert.equal(result.findings.some((finding) => finding.code === "COMPOSE_DEPENDENCY_HEALTHCHECK_MISSING"), false);
  assert.equal(result.ready, true);
});


test("readiness analysis warns about required environment variables without values", () => {
  const result = analyzeComposeReadiness({
    services: {
      api: { image: "example/api:1", environment: ["DATABASE_URL", "LOG_LEVEL=info"] },
    },
  });
  assert.ok(result.findings.some((finding) =>
    finding.code === "COMPOSE_REQUIRED_ENVIRONMENT_VARIABLE" && finding.message.includes("DATABASE_URL")
  ));
  assert.equal(result.findings.some((finding) => finding.message.includes("LOG_LEVEL")), false);
});

test("readiness analysis warns about inline secret-like environment values", () => {
  const result = analyzeComposeReadiness({
    services: {
      api: { image: "example/api:1", environment: { API_TOKEN: "hard-coded-token", DB_PASSWORD: "${DB_PASSWORD}" } },
    },
  });
  assert.ok(result.findings.some((finding) =>
    finding.code === "COMPOSE_INLINE_SECRET" && finding.message.includes("API_TOKEN")
  ));
  assert.equal(result.findings.some((finding) =>
    finding.code === "COMPOSE_INLINE_SECRET" && finding.message.includes("DB_PASSWORD")
  ), false);
});

test("readiness analysis validates env_file shape", () => {
  const result = analyzeComposeReadiness({
    services: { api: { image: "example/api:1", env_file: { path: ".env" } } },
  });
  assert.ok(result.findings.some((finding) => finding.code === "COMPOSE_INVALID_ENV_FILE"));
});


test("readiness analysis warns about mutable image tags but accepts pinned versions", () => {
  const result = analyzeComposeReadiness({
    services: {
      latest: { image: "nginx:latest" },
      unpinned: { image: "redis" },
      pinned: { image: "postgres:17.2" },
      registry: { image: "registry.example:5000/team/api:v2" },
    },
  });
  const mutable = result.findings.filter((finding) => finding.code === "COMPOSE_MUTABLE_IMAGE_TAG");
  assert.equal(mutable.length, 2);
  assert.ok(mutable.some((finding) => finding.message.includes("nginx:latest")));
  assert.ok(mutable.some((finding) => finding.message.includes("redis")));
});

test("readiness analysis flags privileged and host-network containers", () => {
  const result = analyzeComposeReadiness({
    services: {
      api: { image: "example/api:1", privileged: true, network_mode: "host" },
    },
  });
  assert.ok(result.findings.some((finding) => finding.code === "COMPOSE_PRIVILEGED_CONTAINER"));
  assert.ok(result.findings.some((finding) => finding.code === "COMPOSE_HOST_NETWORK"));
});

test("readiness analysis identifies published ports and missing resource limits", () => {
  const result = analyzeComposeReadiness({
    services: {
      web: { image: "nginx:1.27", ports: ["8080:80"] },
      worker: { image: "worker:2", deploy: { resources: { limits: { memory: "512M" } } } },
    },
  });
  assert.ok(result.findings.some((finding) => finding.code === "COMPOSE_PUBLISHED_PORT"));
  assert.ok(result.findings.some((finding) => finding.code === "COMPOSE_RESOURCE_LIMITS_MISSING" && finding.message.includes("web")));
  assert.equal(result.findings.some((finding) => finding.code === "COMPOSE_RESOURCE_LIMITS_MISSING" && finding.message.includes("worker")), false);
});
