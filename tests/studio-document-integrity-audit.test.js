import test from "node:test";
import assert from "node:assert/strict";
import { createComposeDocument, exportComposeYaml, validateComposeDocument } from "../src/features/docker-compose/composeDocumentService.js";

// STUDIO-001: characterization tests. Known limitations are documented rather than silently fixed.
test("Compose normalization does not mutate nested source mappings", () => {
  const source = {
    name: "audit",
    services: { api: { image: "example/api:1", environment: { MODE: "safe" } } },
    networks: { backend: { driver: "bridge" } },
    volumes: { data: {} },
  };
  const normalized = createComposeDocument(source);
  normalized.services.api.environment.MODE = "changed";
  normalized.networks.backend.driver = "overlay";
  assert.equal(source.services.api.environment.MODE, "safe");
  assert.equal(source.networks.backend.driver, "bridge");
});

test("Compose direct export preserves declared secrets and configs", () => {
  const source = {
    services: { api: { image: "example/api:1", secrets: ["token"], configs: ["settings"] } },
    secrets: { token: { external: true } },
    configs: { settings: { file: "./settings.conf" } },
  };
  const yaml = exportComposeYaml(source);
  assert.match(yaml, /secrets:\n\s+token:\n\s+external: true/);
  assert.match(yaml, /configs:\n\s+settings:\n\s+file: "\.\/settings\.conf"/);
  assert.equal(validateComposeDocument(source).findings.some(({ code }) => code === "COMPOSE_UNKNOWN_SECRET" || code === "COMPOSE_UNKNOWN_CONFIG"), true);
});

test("KNOWN LIMITATION: normalized Compose document drops top-level secrets and configs", () => {
  const source = {
    services: { api: { image: "example/api:1", secrets: ["token"], configs: ["settings"] } },
    secrets: { token: { external: true } },
    configs: { settings: { file: "./settings.conf" } },
  };
  const normalized = createComposeDocument(source);
  assert.equal(Object.hasOwn(normalized, "secrets"), false);
  assert.equal(Object.hasOwn(normalized, "configs"), false);
  const findings = validateComposeDocument(normalized).findings;
  assert.ok(findings.some(({ code }) => code === "COMPOSE_UNKNOWN_SECRET"));
  assert.ok(findings.some(({ code }) => code === "COMPOSE_UNKNOWN_CONFIG"));
});

test("KNOWN LIMITATION: Compose export of normalized document loses extra top-level mappings", () => {
  const source = {
    services: { api: { image: "example/api:1" } },
    "x-shared": { enabled: true },
  };
  const direct = exportComposeYaml(source);
  const normalized = exportComposeYaml(createComposeDocument(source));
  assert.equal(direct.includes("x-shared:"), false);
  assert.equal(normalized.includes("x-shared:"), false);
});
