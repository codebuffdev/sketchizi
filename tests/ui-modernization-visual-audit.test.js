import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateVisualAuditUrl } from '../scripts/ui-visual-audit.mjs';

const script = readFileSync(new URL('../scripts/ui-visual-audit.mjs', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../.github/workflows/ui-visual-audit.yml', import.meta.url), 'utf8');

test('visual audit accepts absolute HTTP and HTTPS URLs only', () => {
  assert.equal(validateVisualAuditUrl('https://staging.example.test').hostname, 'staging.example.test');
  assert.equal(validateVisualAuditUrl('http://localhost:4173').port, '4173');
  assert.throws(() => validateVisualAuditUrl('/relative'), /absolute HTTP\(S\)/);
  assert.throws(() => validateVisualAuditUrl('javascript:alert(1)'), /HTTP\(S\)/);
  assert.throws(() => validateVisualAuditUrl('https://user:pass@example.test'), /embedded credentials/);
});

test('visual audit captures creation screen across five viewport classes', () => {
  for (const viewport of ['desktop', 'laptop', 'tablet', 'mobile', 'mobile-landscape']) assert.ok(script.includes(`name: "${viewport}"`));
  assert.match(script, /horizontal overflow/);
  assert.match(script, /fullPage: true/);
});

test('visual audit exercises the blank editor on desktop and mobile', () => {
  assert.match(script, /viewport\.name === "desktop" \|\| viewport\.name === "mobile"/);
  assert.match(script, /\.excalidraw/);
  assert.match(script, /pageerror/);
});

test('manual workflow installs Chromium, runs the audit and uploads screenshots', () => {
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /playwright install --with-deps chromium/);
  assert.match(workflow, /ui-visual-audit\.mjs/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
});
