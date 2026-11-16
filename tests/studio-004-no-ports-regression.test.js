import test from "node:test";
import assert from "node:assert/strict";
import { convertComposeToKubernetes } from "../src/features/docker-compose/composeToKubernetes.js";

test("services without declared ports do not produce spurious port warnings", () => {
  const { manifests, warnings } = convertComposeToKubernetes({ services: { worker: { image: "example/worker:1" } } });
  assert.equal(manifests.length, 1);
  assert.equal(warnings.filter(({ field }) => field === "ports").length, 0);
});
