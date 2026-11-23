import { serviceNames } from "./yamlPreview.js";

const RUNNABLE = (node) => node.kind !== "client" && node.kind !== "dns" && node.kind !== "cdn" && node.image && !String(node.image).startsWith("n/a");
const quote = (value) => JSON.stringify(String(value ?? ""));
function stackServiceNames(nodes) {
  const names = serviceNames(nodes);
  const used = new Set();
  const canonical = { sql: "postgres", queue: "kafka" };
  for (const node of nodes) {
    const base = canonical[node.kind] || names.get(node.id);
    let name = base;
    let suffix = 2;
    while (used.has(name)) name = `${base}-${suffix++}`;
    used.add(name);
    names.set(node.id, name);
  }
  return names;
}
const volumePath = (kind) => ({ sql: "/var/lib/postgresql/data", nosql: "/data/db", redis: "/data", queue: "/bitnami/kafka", search: "/usr/share/opensearch/data", "object-storage": "/data" }[kind] || null);
const dependencyEnv = (target, name) => {
  const port = Number(target.port) || ({ sql: 5432, redis: 6379, queue: 9092 }[target.kind] || 80);
  if (target.kind === "sql") return ["DATABASE_URL", `postgresql://${name}:5432/app`];
  if (target.kind === "redis") return ["REDIS_URL", `redis://${name}:${port}`];
  if (target.kind === "queue") return ["KAFKA_BROKERS", `${name}:${port}`];
  if (target.kind === "nosql") return ["MONGODB_URL", `mongodb://${name}:${port}/app`];
  if (target.kind === "search") return ["SEARCH_URL", `http://${name}:${port}`];
  if (target.kind === "object-storage") return ["OBJECT_STORAGE_URL", `http://${name}:${port}`];
  return null;
};

export function inferStackDependencies(nodes = [], edges = []) {
  const names = stackServiceNames(nodes);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const dependencies = new Map(nodes.map((node) => [node.id, []]));
  const environments = new Map(nodes.map((node) => [node.id, {}]));
  for (const edge of edges) {
    const source = byId.get(edge.from);
    const target = byId.get(edge.to);
    if (!source || !target || !RUNNABLE(source) || !RUNNABLE(target)) continue;
    const env = dependencyEnv(target, names.get(target.id));
    if (env) environments.get(source.id)[env[0]] = env[1];
    if (!dependencies.get(source.id).includes(names.get(target.id))) dependencies.get(source.id).push(names.get(target.id));
  }
  return { names, dependencies, environments };
}

export function compileKubernetesStack(nodes = [], edges = []) {
  const runnable = nodes.filter(RUNNABLE);
  if (!runnable.length) return "# Add a service, database, cache or queue to export a Kubernetes stack.\n";
  const { names, environments } = inferStackDependencies(nodes, edges);
  const docs = [];
  for (const node of runnable) {
    const name = names.get(node.id);
    const env = environments.get(node.id) || {};
    if (node.kind === "sql") {
      docs.push(["apiVersion: v1", "kind: Secret", "metadata:", `  name: ${name}-credentials`, "  namespace: prod", "type: Opaque", "stringData:", "  POSTGRES_PASSWORD: CHANGE_ME_BEFORE_DEPLOY"].join("\n"));
    }
    if (Object.keys(env).length) {
      docs.push([
        "apiVersion: v1", "kind: ConfigMap", "metadata:", `  name: ${name}-config`, "  namespace: prod", "data:",
        ...Object.entries(env).map(([key, value]) => `  ${key}: ${quote(value)}`),
      ].join("\n"));
    }
    const stateful = ["sql", "nosql", "redis", "queue", "search", "object-storage"].includes(node.kind);
    const workload = stateful ? "StatefulSet" : "Deployment";
    docs.push([
      "apiVersion: apps/v1", `kind: ${workload}`, "metadata:", `  name: ${name}`, "  namespace: prod", "spec:",
      `  replicas: ${Math.max(1, Number(node.replicas) || 1)}`,
      ...(stateful ? [`  serviceName: ${name}`] : []),
      "  selector:", "    matchLabels:", `      app: ${name}`, "  template:", "    metadata:", "      labels:", `        app: ${name}`,
      "    spec:", "      containers:", `        - name: ${name}`, `          image: ${node.image}`, "          ports:",
      `            - name: app`, `              containerPort: ${Number(node.port) || 8080}`,
      "          resources:", "            requests:", "              cpu: 100m", "              memory: 128Mi", "            limits:", "              cpu: 1000m", "              memory: 512Mi",
      ...(stateful && volumePath(node.kind) ? ["          volumeMounts:", "            - name: data", `              mountPath: ${volumePath(node.kind)}`] : []),
      ...((Object.keys(env).length || node.kind === "sql") ? ["          envFrom:", ...(Object.keys(env).length ? ["            - configMapRef:", `                name: ${name}-config`] : []), ...(node.kind === "sql" ? ["            - secretRef:", `                name: ${name}-credentials`] : [])] : []),
      ...(stateful && volumePath(node.kind) ? ["  volumeClaimTemplates:", "    - metadata:", "        name: data", "      spec:", "        accessModes: [ReadWriteOnce]", "        resources:", "          requests:", "            storage: 10Gi"] : []),
    ].join("\n"));
    const serviceType = node.kind === "load-balancer" ? "LoadBalancer" : "ClusterIP";
    docs.push([
      "apiVersion: v1", "kind: Service", "metadata:", `  name: ${name}`, "  namespace: prod", "spec:",
      `  type: ${serviceType}`, ...(stateful ? ["  clusterIP: None"] : []), "  selector:", `    app: ${name}`, "  ports:", "    - name: app", "      protocol: TCP",
      `      port: ${Number(node.port) || 8080}`, `      targetPort: ${Number(node.port) || 8080}`,
    ].join("\n"));
    docs.push([
      "apiVersion: autoscaling/v2", "kind: HorizontalPodAutoscaler", "metadata:", `  name: ${name}`, "  namespace: prod",
      "spec:", `  scaleTargetRef:`, `    apiVersion: apps/v1`, `    kind: ${workload}`, `    name: ${name}`,
      "  minReplicas: 1", `  maxReplicas: ${Math.max(3, (Number(node.replicas) || 1) * 3)}`,
      "  metrics:", "    - type: Resource", "      resource:", "        name: cpu", "        target:", "          type: Utilization", "          averageUtilization: 70",
    ].join("\n"));
  }
  return `# Generated by Sketchizi System Design Studio\n# Review secrets, resource requests and storage classes before production use.\n${docs.join("\n---\n")}\n`;
}

export function compileDockerCompose(nodes = [], edges = []) {
  const runnable = nodes.filter(RUNNABLE);
  if (!runnable.length) return "# Add a service, database, cache or queue to export a Compose stack.\n";
  const { names, dependencies, environments } = inferStackDependencies(nodes, edges);
  const volumeNames = new Set();
  const lines = ["# Generated by Sketchizi System Design Studio", "# Review secrets and production resource limits before deployment.", "services:"];
  for (const node of runnable) {
    const name = names.get(node.id);
    lines.push(`  ${name}:`, `    image: ${quote(node.image)}`, "    restart: unless-stopped", "    ports:", `      - ${quote(`${Number(node.port) || 8080}:${Number(node.port) || 8080}`)}`);
    const env = {
      ...(node.kind === "sql" ? { POSTGRES_DB: "app", POSTGRES_USER: "postgres", POSTGRES_PASSWORD: "${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD before starting the stack}" } : {}),
      ...(environments.get(node.id) || {}),
    };
    if (Object.keys(env).length) {
      lines.push("    environment:");
      for (const [key, value] of Object.entries(env)) lines.push(`      ${key}: ${quote(value)}`);
    }
    const deps = dependencies.get(node.id) || [];
    if (deps.length) {
      lines.push("    depends_on:");
      for (const dep of deps) lines.push(`      ${dep}:`, "        condition: service_started");
    }
    const path = volumePath(node.kind);
    if (path) {
      const volume = `${name}-data`;
      volumeNames.add(volume);
      lines.push("    volumes:", `      - ${volume}:${path}`);
    }
    if (Number(node.replicas) > 1) lines.push("    deploy:", `      replicas: ${Number(node.replicas)}`);
    lines.push("    networks:", "      - sketchizi");
  }
  lines.push("networks:", "  sketchizi:", "    driver: bridge");
  if (volumeNames.size) {
    lines.push("volumes:");
    for (const volume of volumeNames) lines.push(`  ${volume}:`);
  }
  return `${lines.join("\n")}\n`;
}

export function compileStack(nodes, edges, target = "k8s") {
  return target === "compose" ? compileDockerCompose(nodes, edges) : compileKubernetesStack(nodes, edges);
}
