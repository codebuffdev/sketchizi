/**
 * Infer potential network reachability from declared Compose networks.
 * Reachability is not evidence of an actual request or open listening port.
 */
const networksOf = (service) => {
  if (Array.isArray(service?.networks)) return service.networks;
  if (service?.networks && typeof service.networks === "object") return Object.keys(service.networks);
  return ["default"];
};
export function exploreComposeNetworkReachability(document, start) {
  const services = document?.services;
  if (!services || typeof services !== "object" || Array.isArray(services)) throw new TypeError("Compose services mapping required.");
  if (!Object.hasOwn(services, start)) throw new Error("Unknown starting service: " + start);
  const fromNetworks = networksOf(services[start]);
  const peers = Object.entries(services).filter(([name]) => name !== start).map(([name, service]) => ({
    name,
    sharedNetworks: fromNetworks.filter((network) => networksOf(service).includes(network)),
    exposedPorts: Array.isArray(service?.expose) ? service.expose : [],
    publishedPorts: Array.isArray(service?.ports) ? service.ports : [],
  })).filter((peer) => peer.sharedNetworks.length);
  return { start, networks: fromNetworks, peers };
}
