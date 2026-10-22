import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWorkbenchExtension } from "../src/features/workbench/workbenchDocument.js";

const views = [{ id: "system", label: "System" }];

test("new Workbench documents initialize persistent policy governance collections", () => {
  const workbench = createWorkbenchExtension({ activeViewId: "system", views, viewScenes: {} });
  assert.deepEqual(workbench.policyGovernance, { policyHistory: [], approvalEvents: [] });
});

test("Policy tab is wired to the document-backed policy governance update callback", async () => {
  const panel = await readFile(new URL("../src/features/workbench/WorkbenchPanel.jsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const controller = await readFile(new URL("../src/features/workbench/useWorkbenchController.js", import.meta.url), "utf8");
  assert.match(panel, /aria-label="Policy approval"/);
  assert.match(panel, /onUpdatePolicyGovernance={onUpdatePolicyGovernance}/);
  assert.match(app, /onUpdatePolicyGovernance={workbenchController\.updatePolicyGovernance}/);
  assert.match(controller, /policyGovernance: \{/);
  assert.match(controller, /saveDocument\(next\)/);
});
