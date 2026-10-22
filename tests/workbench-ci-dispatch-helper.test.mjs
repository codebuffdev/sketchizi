import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const script = await readFile(new URL('../scripts/run-workbench-ci.ps1', import.meta.url), 'utf8');
const guide = await readFile(new URL('../docs/WORKBENCH_CI_RUN_0.77.md', import.meta.url), 'utf8');

test('CI helper dispatches the existing workflow and checks local source matches remote ref', () => {
  assert.match(script, /gh workflow run \$workflow --ref \$Ref/);
  assert.match(script, /git ls-remote --heads origin \$Ref/);
  assert.match(script, /remoteHead -ne \$localHead/);
  assert.match(script, /No push was performed by this script/);
});

test('CI helper waits for completion and rejects evidence from a different commit', () => {
  assert.match(script, /gh run view \$RunId --json status,conclusion,url,headSha,event/);
  assert.match(script, /run\.status -eq "completed"/);
  assert.match(script, /run\.headSha -ne \$localHead/);
});

test('CI helper downloads and inspects the release diagnostic artifact even for failed runs', () => {
  assert.match(script, /gh run download \$RunId --name \$artifactName --dir \$destination/);
  assert.match(script, /inspect-workbench-release-diagnostic-bundle\.mjs/);
  assert.match(script, /run\.conclusion -ne "success"/);
  assert.match(guide, /still collects and analyzes the available evidence even for failed runs/);
});

test('documentation provides PowerShell commands and states the real-CI verification boundary', () => {
  assert.match(guide, /\.\\scripts\\run-workbench-ci\.ps1/);
  assert.match(guide, /No GitHub Actions run is claimed/);
  assert.match(guide, /[Ee]vidence receipt/);
});

test('CI helper isolates downloads by run ID and refuses unrelated ZIP files', () => {
  assert.match(script, /Join-Path \$outputRoot \(\"run-\{0\}\" -f \$RunId\)/);
  assert.match(script, /Remove-Item -LiteralPath \$destination -Recurse -Force/);
  assert.match(script, /-Filter \"workbench-release-diagnostic-bundle\.zip\"/);
  assert.match(script, /Refusing to inspect an unrelated or stale ZIP/);
});
