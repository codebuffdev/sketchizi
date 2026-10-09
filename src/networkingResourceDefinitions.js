const envOptions = ["development", "staging", "production"];
const defs = [
  ["router", "Router", ["cidr", "region", "availabilityZone", "environment"]],
  ["switch", "Switch", ["networkType", "environment"]],
  ["firewall", "Firewall", ["cidr", "region", "environment"]],
  ["load-balancer", "Load Balancer", ["region", "availabilityZone", "networkType", "environment"]],
  ["reverse-proxy", "Reverse Proxy", ["region", "environment"]],
  ["dns", "DNS", ["region", "environment"]],
  ["cdn", "CDN", ["region", "environment"]],
  ["vpn", "VPN", ["cidr", "region", "environment"]],
  ["nat-gateway", "NAT Gateway", ["region", "availabilityZone", "environment"]],
  ["internet-gateway", "Internet Gateway", ["region", "environment"]],
  ["vpc-vnet", "VPC/VNet", ["cidr", "region", "networkType", "environment"]],
  ["subnet", "Subnet", ["cidr", "region", "availabilityZone", "environment"]],
  ["network", "Network", ["cidr", "networkType", "environment"]],
  ["endpoint", "Endpoint", ["region", "networkType", "environment"]],
];
const fields = {
  cidr: { key: "cidr", label: "CIDR", type: "text", defaultValue: "", placeholder: "192.168.1.0/24" },
  region: { key: "region", label: "Region", type: "text", defaultValue: "" },
  networkType: { key: "networkType", label: "Network type", type: "select", defaultValue: "private", options: ["public", "private", "hybrid", "isolated", "overlay", "underlay"] },
  availabilityZone: { key: "availabilityZone", label: "Availability zone", type: "text", defaultValue: "" },
  environment: { key: "environment", label: "Environment", type: "select", defaultValue: "development", options: envOptions },
};
export const networkingResourceDefinitions = defs.map(([id, displayName, keys]) => ({
  id: `networking:${id}`, provider: "networking", service: "Networking", resourceType: id,
  displayName, iconId: `networking:${id}`,
  properties: [{ key: "name", label: "Name", type: "text", defaultValue: displayName }, ...keys.map((key) => fields[key])],
}));
export function getNetworkingResourceDefinitionById(id) { return networkingResourceDefinitions.find((d) => d.id === id) || null; }
export function getNetworkingResourceDefinitionForIcon(icon) { return networkingResourceDefinitions.find((d) => d.iconId === icon?.id) || null; }
export function getNetworkingResourceDefaults(definition) { return Object.fromEntries((definition?.properties || []).map((p) => [p.key, p.defaultValue ?? ""])); }
export function validateCidr(value) {
  if (value == null || String(value).trim() === "") return { valid: true, empty: true };
  const input = String(value).trim();
  const parts = input.split("/");
  if (parts.length !== 2 || !/^\d+$/.test(parts[1])) return { valid: false, message: "Enter a CIDR such as 192.168.1.0/24 or 2001:db8::/32." };
  const prefix = Number(parts[1]);
  if (parts[0].includes(":")) {
    const address = parts[0];
    const compressed = address.includes("::");
    const groups = address.split(":");
    const malformedGroups = groups.some((group) => group && !/^[0-9a-fA-F]{1,4}$/.test(group));
    const groupCount = groups.filter(Boolean).length;
    if (!/^[0-9a-fA-F:]+$/.test(address) || !address.includes(":") || address.includes(":::") || (address.match(/::/g) || []).length > 1 || malformedGroups || (compressed ? groupCount >= 8 : groupCount !== 8) || prefix > 128) return { valid: false, message: "Invalid IPv6 CIDR address or prefix (0–128)." };
    return { valid: true, family: 6 };
  }
  const octets = parts[0].split(".");
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet) || Number(octet) > 255) || prefix > 32) return { valid: false, message: "Invalid IPv4 CIDR address or prefix (0–32)." };
  return { valid: true, family: 4 };
}
