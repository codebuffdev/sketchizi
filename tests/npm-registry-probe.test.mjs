import test from "node:test";
import assert from "node:assert/strict";
import { probeNpmRegistry, renderRegistryProbe } from "../scripts/probe-npm-registry.mjs";

const okLookup = async () => [
  { address: "192.0.2.10", family: 4 },
  { address: "2001:db8::10", family: 6 },
];
const okFetch = async () => ({ ok: true, status: 200, json: async () => ({ version: "0.18.0-c0ad61c" }) });

test("probe reports reachable registry and the exact pinned package version", async () => {
  const result = await probeNpmRegistry({ lookup: okLookup, fetchImpl: okFetch });
  assert.equal(result.status, "reachable");
  assert.equal(result.dns.status, "resolved");
  assert.equal(result.dns.addresses.length, 2);
  assert.equal(result.http.statusCode, 200);
  assert.equal(result.http.packageVersion, "0.18.0-c0ad61c");
  assert.match(renderRegistryProbe(result), /connectivity probe: REACHABLE/);
});

test("probe classifies temporary DNS errors separately from HTTP errors", async () => {
  const result = await probeNpmRegistry({
    lookup: async () => { const error = new Error("temporary failure in name resolution"); error.code = "EAI_AGAIN"; throw error; },
    fetchImpl: okFetch,
  });
  assert.equal(result.status, "dns-failed");
  assert.equal(result.dns.error.code, "EAI_AGAIN");
  assert.equal(result.http.status, "not-attempted");
});

test("probe records a registry HTTP failure after DNS succeeds", async () => {
  const result = await probeNpmRegistry({ lookup: okLookup, fetchImpl: async () => ({ ok: false, status: 503 }) });
  assert.equal(result.status, "http-error");
  assert.equal(result.http.statusCode, 503);
});

test("probe detects metadata that does not confirm the pinned version", async () => {
  const result = await probeNpmRegistry({
    lookup: okLookup,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ version: "0.18.1" }) }),
  });
  assert.equal(result.status, "version-mismatch");
  assert.equal(result.http.packageVersion, "0.18.1");
});

test("probe records timeout/network exceptions without losing DNS results", async () => {
  const result = await probeNpmRegistry({ lookup: okLookup, fetchImpl: async () => { const error = new Error("network timeout"); error.code = "ETIMEDOUT"; throw error; } });
  assert.equal(result.status, "http-failed");
  assert.equal(result.dns.status, "resolved");
  assert.equal(result.http.error.code, "ETIMEDOUT");
});
