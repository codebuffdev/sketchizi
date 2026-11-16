import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseAllDocuments, stringify } from "yaml";
import { convertComposeToKubernetes } from "../src/features/docker-compose/composeToKubernetes.js";

test("conversion preview exports parseable multi-document Kubernetes YAML", () => {
  const proposal = convertComposeToKubernetes({ services: { api: { image: "example/api:1", ports: ["8080:3000"] } } });
  const yaml = proposal.manifests.map((manifest) => stringify(manifest).trimEnd()).join("\n---\n") + "\n";
  const parsed = parseAllDocuments(yaml);
  assert.equal(parsed.length, 2);
  assert.deepEqual(parsed.map((document) => document.toJS().kind), ["Deployment", "Service"]);
  assert.ok(parsed.every((document) => document.errors.length === 0));
});

test("Compose Studio exposes read-only conversion preview and download", async () => {
  const source = await readFile(new URL("../src/features/docker-compose/ui/DockerComposeStudio.jsx", import.meta.url), "utf8");
  assert.match(source, /convertComposeToKubernetes\(composeDoc\)/);
  assert.match(source, /Preview Kubernetes YAML/);
  assert.match(source, /Download Kubernetes YAML/);
  assert.match(source, /No Kubernetes resources are deployed/);
});
