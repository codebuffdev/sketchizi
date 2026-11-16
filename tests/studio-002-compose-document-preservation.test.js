import test from "node:test";
import assert from "node:assert/strict";
import { parseDocument } from "yaml";
import { createComposeDocument, exportComposeYaml, validateComposeDocument } from "../src/features/docker-compose/composeDocumentService.js";

test("STUDIO-002 preserves secrets, configs, and extension fields across normalization and YAML export", () => {
  const original = {
    name: "demo",
    services: {
      api: { image: "example/api:1", secrets: ["api_token"], configs: ["settings"], "x-service-hint": { owner: "platform" } },
    },
    secrets: { api_token: { external: true } },
    configs: { settings: { file: "./settings.conf" } },
    "x-shared": { retries: 3, nested: { enabled: true } },
  };
  const normalized = createComposeDocument(original);
  normalized["x-shared"].nested.enabled = false;
  assert.equal(original["x-shared"].nested.enabled, true, "normalization must deep-clone source");
  assert.deepEqual(normalized.secrets, original.secrets);
  assert.deepEqual(normalized.configs, original.configs);
  const yaml = exportComposeYaml(normalized);
  const parsed = parseDocument(yaml, { uniqueKeys: true });
  assert.equal(parsed.errors.length, 0);
  const exported = parsed.toJS();
  assert.deepEqual(exported.secrets, original.secrets);
  assert.deepEqual(exported.configs, original.configs);
  assert.deepEqual(exported["x-shared"], { retries: 3, nested: { enabled: false } });
  assert.deepEqual(exported.services.api["x-service-hint"], { owner: "platform" });
  assert.equal(validateComposeDocument(normalized).findings.some(({ code }) => code === "COMPOSE_UNKNOWN_SECRET" || code === "COMPOSE_UNKNOWN_CONFIG"), false);
});

test("STUDIO-002 retains unknown top-level mappings and service fields after an edit", () => {
  const input = {
    services: { web: { image: "nginx:1.27", "x-extra": { labels: ["a", "b"] } } },
    "x-team-defaults": { labels: { team: "infra" } },
  };
  const document = createComposeDocument(input);
  document.services.web.image = "nginx:1.28";
  const output = parseDocument(exportComposeYaml(document), { uniqueKeys: true }).toJS();
  assert.equal(output.services.web.image, "nginx:1.28");
  assert.deepEqual(output.services.web["x-extra"], input.services.web["x-extra"]);
  assert.deepEqual(output["x-team-defaults"], input["x-team-defaults"]);
  assert.equal(input.services.web.image, "nginx:1.27");
});

test("STUDIO-002 preserves empty top-level extension mappings", () => {
  const parsed = parseDocument(exportComposeYaml({ services: { api: { image: "alpine:3" } }, "x-empty": {} }), { uniqueKeys: true });
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.toJS()["x-empty"], {});
});
