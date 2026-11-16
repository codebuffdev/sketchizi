import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/components/app/ArchitectureValidationPanel.jsx", import.meta.url), "utf8");

test("architecture review panel exposes explicit shared workspace operations", () => {
  assert.match(source, /window\.__SKETCHIZI_SUPABASE_CLIENT__/);
  assert.match(source, /Check shared workspace/);
  assert.match(source, /Save to shared workspace/);
  assert.match(source, /Load shared copy/);
  assert.match(source, /createSystemDesignReviewRemoteStore/);
});

test("remote sync remains explicit and reports missing host configuration", () => {
  assert.match(source, /Shared sync is not configured/);
  assert.match(source, /Remote sync requires an authenticated Supabase client/);
  assert.match(source, /setRemoteBusy\(false\)/);
});
