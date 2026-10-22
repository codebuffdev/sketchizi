import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const helper = await readFile(path.join(root, "scripts", "run-workbench-ci.ps1"), "utf8");
const workflow = await readFile(path.join(root, ".github", "workflows", "workbench-release-gate.yml"), "utf8");

test("CI helper pins the expected release workflow name", () => {
  const match = workflow.match(/^name:\s*(.+)$/m);
  assert.ok(match, "workflow must declare a name");
  assert.ok(helper.includes(`$expectedWorkflowName = "${match[1]}"`));
});

test("CI helper requests workflow and branch metadata from GitHub CLI", () => {
  assert.match(helper, /gh run view \$RunId --json status,conclusion,url,headSha,event,headBranch,workflowName/);
  assert.match(helper, /\$run\.workflowName -ne \$expectedWorkflowName/);
  assert.match(helper, /\$run\.headBranch -ne \$Ref/);
});

test("fresh dispatch cannot accidentally select a push or pull-request run", () => {
  assert.match(helper, /\$dispatchedByThisScript = \$RunId -le 0/);
  assert.match(helper, /\$dispatchedByThisScript -and \$run\.event -ne "workflow_dispatch"/);
  assert.match(helper, /Refusing to analyze an unrelated run/);
});

test("run SHA must match the intended local commit before downloading evidence", () => {
  const shaGuard = helper.indexOf("if ($run.headSha -ne $localHead)");
  const download = helper.indexOf("gh run download $RunId");
  assert.ok(shaGuard >= 0 && download > shaGuard, "SHA validation must precede artifact download");
  assert.match(helper, /Refusing to analyze evidence from different source code/);
});

test("diagnostic archive is selected only after workflow, branch and SHA checks", () => {
  const metadataGuard = helper.indexOf("if ($run.workflowName -ne $expectedWorkflowName)");
  const archiveLookup = helper.indexOf('$bundles = @(Get-ChildItem -Path $destination');
  assert.ok(metadataGuard >= 0 && archiveLookup > metadataGuard);
  assert.match(helper, /workbench-release-diagnostic-bundle\.zip/);
  assert.match(helper, /\$bundles\.Count -ne 1/);
  const archiveBlock = helper.slice(archiveLookup, helper.indexOf('Write-Host "Inspecting', archiveLookup));
  assert.doesNotMatch(archiveBlock, /Select-Object -First 1/);
  assert.match(helper, /write-workbench-ci-evidence-receipt\.mjs/);
});


test("CI helper verifies the generated evidence receipt before reporting the run result", () => {
  const writeReceipt = helper.indexOf("write-workbench-ci-evidence-receipt.mjs");
  const verifyReceipt = helper.indexOf("verify-workbench-ci-evidence-receipt.mjs");
  const finalConclusion = helper.indexOf('if ($run.conclusion -ne "success")');
  assert.ok(writeReceipt >= 0 && verifyReceipt > writeReceipt && finalConclusion > verifyReceipt);
  assert.match(helper, /CI evidence receipt verification failed/);
});
