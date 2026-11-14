import test from "node:test";
import assert from "node:assert/strict";
import { exploreComposeNetworkReachability } from "../src/features/docker-compose/composeNetworkReachability.js";

test("services with implicit default networks are potentially reachable", () => {
  const result = exploreComposeNetworkReachability({ services: { web: {}, api: {}, isolated: { networks: ["private"] } } }, "web");
  assert.deepEqual(result.peers.map((peer) => peer.name), ["api"]);
  assert.deepEqual(result.peers[0].sharedNetworks, ["default"]);
});
test("explicit network intersection is required for potential reachability", () => {
  const result = exploreComposeNetworkReachability({ services: { web: { networks: ["front", "shared"] }, api: { networks: { shared: {} } }, db: { networks: ["back"] } } }, "web");
  assert.deepEqual(result.peers.map((peer) => peer.name), ["api"]);
  assert.deepEqual(result.peers[0].sharedNetworks, ["shared"]);
});
test("rejects unknown starting services", () => {
  assert.throws(() => exploreComposeNetworkReachability({ services: {} }, "missing"), /Unknown starting service/);
});
