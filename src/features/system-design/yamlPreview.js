// Live YAML previews and studio-mode badges derived from node metadata. Pure strings, no yaml dependency.

import { getPrimitive } from "./primitives.js";

export const STUDIO_MODES = [
  { id: "canvas", label: "Canvas" },
  { id: "k8s", label: "K8s Studio" },
  { id: "compose", label: "Compose" },
];

export function slugify(label, fallback = "service") {
  const slug = String(label || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return slug || fallback;
}

/** Unique, stable service names across a node list (suffix -2, -3 on collision). */
export function serviceNames(nodes) {
  const seen = new Map();
  return new Map(nodes.map((node) => {
    const base = slugify(node.label, node.kind);
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return [node.id, count === 1 ? base : `${base}-${count}`];
  }));
}

const isRunnable = (node) => node.kind !== "client" && node.kind !== "dns" && node.kind !== "cdn" && node.image && !String(node.image).startsWith("n/a");

export function modeBadge(node, mode, simulation) {
  if (mode === "k8s") {
    if (!isRunnable(node)) return "external";
    const ready = node.health === "down" ? 0 : node.health === "degraded" ? Math.max(1, node.replicas - 1) : node.replicas;
    return `${ready}/${node.replicas} pods`;
  }
  if (mode === "compose") return isRunnable(node) ? `:${node.port}` : "external";
  return node.subtitle || getPrimitive(node.kind)?.subtitle || "";
}

export function kubernetesYaml(nodes, edges = []) {
  const names = serviceNames(nodes);
  const docs = [];
  for (const node of nodes.filter(isRunnable)) {
    const name = names.get(node.id);
    docs.push([
      "apiVersion: apps/v1",
      "kind: Deployment",
      "metadata:",
      `  name: ${name}`,
      `  labels: { app: ${name}, tier: ${node.category} }`,
      "spec:",
      `  replicas: ${node.replicas}`,
      `  selector: { matchLabels: { app: ${name} } }`,
      "  template:",
      `    metadata: { labels: { app: ${name} } }`,
      "    spec:",
      "      containers:",
      `        - name: ${name}`,
      `          image: ${node.image}`,
      `          ports: [{ containerPort: ${node.port} }]`,
      "---",
      "apiVersion: v1",
      "kind: Service",
      "metadata:",
      `  name: ${name}`,
      "spec:",
      `  selector: { app: ${name} }`,
      `  ports: [{ port: ${node.port}, targetPort: ${node.port}, protocol: TCP }]`,
    ].join("\n"));
  }
  return docs.length ? docs.join("\n---\n") : "# Add a service, database or cache to generate manifests.";
}

export function composeYaml(nodes, edges = []) {
  const names = serviceNames(nodes);
  const runnable = nodes.filter(isRunnable);
  if (!runnable.length) return "# Add a service, database or cache to generate a Compose file.";
  const lines = ["services:"];
  for (const node of runnable) {
    const name = names.get(node.id);
    lines.push(`  ${name}:`, `    image: ${node.image}`, `    ports: ["${node.port}:${node.port}"]`);
    if (node.replicas > 1) lines.push("    deploy:", `      replicas: ${node.replicas}`);
    const deps = edges
      .filter((edge) => edge.from === node.id)
      .map((edge) => nodes.find((n) => n.id === edge.to))
      .filter((target) => target && isRunnable(target))
      .map((target) => names.get(target.id));
    if (deps.length) {
      lines.push("    depends_on:");
      for (const dep of [...new Set(deps)]) lines.push(`      - ${dep}`);
    }
  }
  return lines.join("\n");
}

export function studioYaml(mode, nodes, edges) {
  if (mode === "k8s") return kubernetesYaml(nodes, edges);
  if (mode === "compose") return composeYaml(nodes, edges);
  return "";
}

/** Single-node YAML for the inspector drawer. */
export function nodeYaml(mode, node) {
  return studioYaml(mode, [node], []);
}
