import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const serviceWorker = readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');

test('service-worker application cache version matches the application version', () => {
  assert.ok(
    serviceWorker.includes(`const APP_CACHE = "sketchizi-v${packageJson.version}";`),
    'Bump APP_CACHE when the app version changes so deployed clients discard stale cached assets.',
  );
});
