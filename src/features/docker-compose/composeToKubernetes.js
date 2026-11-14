/**
 * Conservative Compose -> Kubernetes conversion. Returns a reviewable manifest
 * proposal and explicit warnings; never deploys resources.
 */
const dnsName = (value) => value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 63);
const portNumber = (value) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value.split("/")[0].split(":").at(-1));
  if (value && typeof value === "object") return Number(value.target);
  return NaN;
};

export function convertComposeToKubernetes(compose) {
  if (!compose || typeof compose !== "object" || Array.isArray(compose) || !compose.services || typeof compose.services !== "object" || Array.isArray(compose.services)) {
    throw new TypeError("A Compose document with a services mapping is required.");
  }
  const manifests = [];
  const warnings = [];
  const names = new Set();
  for (const [serviceName, service] of Object.entries(compose.services)) {
    const name = dnsName(serviceName);
    if (!name || names.has(name)) throw new Error("Invalid or colliding Kubernetes service name: " + serviceName);
    names.add(name);
    if (!service || typeof service !== "object" || Array.isArray(service)) throw new TypeError("Invalid Compose service: " + serviceName);
    if (!service.image || typeof service.image !== "string") {
      warnings.push({ service: serviceName, field: "image", message: "No image defined; build-only services require an image before conversion." });
      continue;
    }
    const labels = { "app.kubernetes.io/name": name };
    const container = { name, image: service.image };
    if (service.environment) {
      if (Array.isArray(service.environment)) {
        const env = service.environment.filter((entry) => typeof entry === "string" && entry.includes("=")).map((entry) => {
          const split = entry.indexOf("=");
          return { name: entry.slice(0, split), value: entry.slice(split + 1) };
        });
        if (env.length) container.env = env;
        if (env.length !== service.environment.length) warnings.push({ service: serviceName, field: "environment", message: "Environment entries without literal values were skipped." });
      } else if (typeof service.environment === "object") {
        container.env = Object.entries(service.environment).filter(([, value]) => value !== null && value !== undefined).map(([key, value]) => ({ name: key, value: String(value) }));
      }
    }
    const ports = [...new Set((service.ports || []).map(portNumber).filter((p) => Number.isInteger(p) && p > 0 && p <= 65535))];
    if (ports.length) container.ports = ports.map((containerPort) => ({ containerPort }));
    manifests.push({ apiVersion: "apps/v1", kind: "Deployment", metadata: { name, labels }, spec: { replicas: 1, selector: { matchLabels: labels }, template: { metadata: { labels }, spec: { containers: [container] } } } });
    if (ports.length) manifests.push({ apiVersion: "v1", kind: "Service", metadata: { name, labels }, spec: { selector: labels, ports: ports.map((port) => ({ port, targetPort: port })) } });
    for (const field of ["build", "depends_on", "volumes", "networks", "secrets", "configs", "deploy", "healthcheck", "command", "entrypoint", "profiles", "restart", "privileged"]) {
      if (Object.hasOwn(service, field)) warnings.push({ service: serviceName, field, message: "Compose " + field + " requires manual Kubernetes review; not converted." });
    }
    if (service.ports?.length !== ports.length) warnings.push({ service: serviceName, field: "ports", message: "Some port mappings could not be converted." });
    if (service.ports?.length) warnings.push({ service: serviceName, field: "ports", message: "Host-published ports and protocols are not preserved; review Service exposure." });
  }
  return { manifests, warnings };
}
