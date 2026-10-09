import test from "node:test";
import assert from "node:assert/strict";
import { networkingResourceDefinitions, validateCidr } from "../src/networkingResourceDefinitions.js";
import { analyzeArchitectureGraph } from "../src/features/architecture/architectureGraphService.js";
import { validateArchitectureWithProviderRules } from "../src/features/architecture/architectureValidationComposition.js";

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
test("unified graph represents native connections between networking and AWS resources", () => {
  const graph = analyzeArchitectureGraph([
    { id: "net-1", type: "rectangle", customData: { networkingResource: { networkingResourceId: "net-1", definitionId: "networking:internet-gateway", provider: "networking", service: "Networking", resourceType: "internet-gateway", properties: { name: "IGW" } } } },
    { id: "aws-1", type: "rectangle", customData: { awsResource: { awsResourceId: "aws-1", definitionId: "aws:test", provider: "aws", service: "EC2", resourceType: "instance", properties: { name: "EC2" } } } },
    { id: "connector-1", type: "arrow", startBinding: { elementId: "net-1" }, endBinding: { elementId: "aws-1" } },
  ]);
  assert.equal(graph.resources.length, 2);
  assert.equal(graph.relationships.some((relationship) => relationship.provider === "architecture" && relationship.sourceProvider === "networking" && relationship.targetProvider === "aws"), true);
  assert.equal(Array.isArray(validateArchitectureWithProviderRules(graph).errors), true);
});
test("invalid networking CIDR is reported by the shared validation engine", () => {
  const graph = analyzeArchitectureGraph([{ id: "net-1", type: "rectangle", customData: { networkingResource: { networkingResourceId: "net-1", definitionId: "networking:network", provider: "networking", service: "Networking", resourceType: "network", properties: { name: "Network", cidr: "10.0.0.0/99" } } } }]);
  const validation = validateArchitectureWithProviderRules(graph);
  assert.equal(validation.errors.some((item) => item.code === "NETWORKING_INVALID_CIDR"), true);
});
