import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("both Studios expose read-only validation correction guidance", async () => {
  for (const path of [
    "../src/features/docker-compose/ui/DockerComposeStudio.jsx",
    "../src/features/kubernetes-studio/ui/KubernetesStudio.jsx",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /<summary>Review suggested correction<\/summary>/);
    assert.match(source, /Preview only — YAML remains unchanged/);
  }
});
