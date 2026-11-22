import test from "node:test";
import assert from "node:assert/strict";
import { networkingResourceDefinitions, validateCidr } from "../src/networkingResourceDefinitions.js";

test("networking catalog contains all required resource types", () => {
  assert.deepEqual(networkingResourceDefinitions.map((item) => item.displayName), ["Router", "Switch", "Firewall", "Load Balancer", "Reverse Proxy", "DNS", "CDN", "VPN", "NAT Gateway", "Internet Gateway", "VPC/VNet", "Subnet", "Network", "Endpoint"]);
});
test("CIDR validation accepts valid IPv4 and IPv6 and rejects invalid prefixes/addresses", () => {
  assert.equal(validateCidr("10.0.0.0/16").valid, true);
  assert.equal(validateCidr("2001:db8::/32").valid, true);
  assert.equal(validateCidr("999.0.0.1/24").valid, false);
  assert.equal(validateCidr("10.0.0.0/33").valid, false);
  assert.equal(validateCidr("2001:::1/32").valid, false);
});
