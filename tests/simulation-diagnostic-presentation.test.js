import test from "node:test";
import assert from "node:assert/strict";
import { partitionSimulationDiagnostics } from "../src/features/simulation/experiments/diagnosticPresentation.js";

test("approximation warnings are separated from actual blocking diagnostics", () => {
  const groups = partitionSimulationDiagnostics([
    { code: "SIM-EXTERNAL-APPROXIMATION", severity: "warning", title: "External API is approximated" },
    { code: "ENGINE-TRAFFIC-ROUTE-INVALID", severity: "blocker", title: "Traffic source must have one route" },
    { code: "SIM-OUTSIDE-ACTIVE-SCOPE", severity: "info", title: "Component excluded" },
  ]);
  assert.deepEqual(groups.blocking.map((item) => item.code), ["ENGINE-TRAFFIC-ROUTE-INVALID"]);
  assert.deepEqual(groups.warnings.map((item) => item.code), ["SIM-EXTERNAL-APPROXIMATION"]);
  assert.deepEqual(groups.info.map((item) => item.code), ["SIM-OUTSIDE-ACTIVE-SCOPE"]);
});

test("does not promote an advisory-only list to a blocker", () => {
  const groups = partitionSimulationDiagnostics([{ severity: "warning", title: "External API is approximated" }]);
  assert.equal(groups.blocking.length, 0);
  assert.equal(groups.warnings.length, 1);
});
