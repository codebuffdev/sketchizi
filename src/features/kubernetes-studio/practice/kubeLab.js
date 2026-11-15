import { hasSelectorRequirements, matchesKubernetesSelector } from "../validation/kubernetesSelector.js";

export const KUBE_LAB_DRAFTS_KEY = "sketchizi.kubeLab.drafts.v1";

export const kubeLabLessons = [
  {
    id: "manifests",
    label: "Manifests",
    title: "Declare a web Pod",
    goal: "Name the Pod web-lab and give it a web container running nginx:alpine on port 80.",
    hint: "Set metadata.name on the Pod. The container name, image, and declared port belong under spec.containers.",
    starter: `apiVersion: v1
kind: Pod
metadata:
  name: my-pod
spec:
  containers:
    - name: web
      image: busybox:1.37
      ports:
        - containerPort: 8080
`,
  },
  {
    id: "labels",
    label: "Labels & selectors",
    title: "Select dev and staging",
    goal: "Keep app: web and add a selector expression for env: dev or staging.",
    hint: "Add matchExpressions beside matchLabels. Use key: env, operator: In, and values: [dev, staging].",
    starter: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
        env: staging
    spec:
      containers:
        - name: web
          image: nginx:alpine
`,
  },
  {
    id: "services",
    label: "Services",
    title: "Route requests to orders",
    goal: "Send traffic from port 80 to the orders Pods on port 8080.",
    hint: "The Pods have the label app: orders. Update spec.selector to match it. You can use 8080 or the named port http as targetPort.",
    starter: `apiVersion: v1
kind: Service
metadata:
  name: orders
spec:
  type: ClusterIP
  selector:
    app: api
  ports:
    - port: 80
      targetPort: 8080
`,
  },
];

const sampleLabels = [
  { name: "web-dev", labels: { app: "web", env: "dev" } },
  { name: "web-staging", labels: { app: "web", env: "staging" } },
  { name: "web-prod", labels: { app: "web", env: "prod" } },
  { name: "worker-dev", labels: { app: "worker", env: "dev" } },
];

const backendPort = { name: "http", containerPort: 8080, protocol: "TCP" };
export const servicePracticePods = ["orders-1", "orders-2"].map((name) => ({
  apiVersion: "v1",
  kind: "Pod",
  metadata: { name, namespace: "default", labels: { app: "orders" } },
  spec: {
    containers: [{
      name: "orders",
      image: "busybox:1.37",
      command: ["busybox", "httpd", "-f", "-p", "8080"],
      ports: [backendPort],
    }],
  },
}));

const list = (value) => Array.isArray(value) ? value : [];
const node = (title, detail) => ({ title, detail });
const describePort = (value) => ["number", "string"].includes(typeof value) ? ":" + value : "—";
const labelText = (labels) => Object.entries(labels ?? {}).map(([key, value]) => key + "=" +
  (typeof value === "string" ? value : "(invalid label)")).join(", ");

export function readKubeLabDrafts(storage) {
  try {
    const saved = JSON.parse((storage ?? globalThis.localStorage)?.getItem(KUBE_LAB_DRAFTS_KEY));
    return Object.fromEntries(kubeLabLessons.flatMap(({ id }) => typeof saved?.[id] === "string" ? [[id, saved[id]]] : []));
  } catch {
    return {};
  }
}

function inspectPod(resource) {
  const pod = resource?.kind === "Pod" ? resource.manifest : null;
  const containers = list(pod?.spec?.containers);
  const web = containers.find((container) => container?.name === "web");
  const shown = web ?? containers[0];
  const declaresPort = list(web?.ports).some((port) => port?.containerPort === 80);
  const shownPort = list(shown?.ports)[0]?.containerPort;
  const image = typeof shown?.image === "string" && shown.image ? shown.image : "Image missing";
  return {
    nodes: [node("Pod", pod ? resource.name : "Add a Pod"), node("Container", shownPort ? image + " · " + describePort(shownPort) : image)],
    connected: Boolean(pod && shown),
    summary: pod && shown ? "The Pod declares " + containers.length + (containers.length === 1 ? " container." : " containers.") : "Declare a Pod with a container.",
    checks: [
      [pod?.apiVersion === "v1" && pod.metadata?.name === "web-lab", "Declare a v1 Pod named web-lab."],
      [web?.image === "nginx:alpine", "Set the web container image to nginx:alpine."],
      [declaresPort, "Declare containerPort: 80 on the web container."],
    ],
  };
}

function inspectLabels(resource) {
  const deployment = resource?.kind === "Deployment" ? resource.manifest : null;
  const selector = deployment?.spec?.selector;
  const templateLabels = deployment?.spec?.template?.metadata?.labels;
  const matches = hasSelectorRequirements(selector)
    ? sampleLabels.filter((pod) => matchesKubernetesSelector(selector, pod.labels)).map((pod) => pod.name)
    : [];
  const includesEnvironments = list(selector?.matchExpressions).some((rule) =>
    rule?.key === "env" && rule.operator === "In" && list(rule.values).length === 2 && rule.values.includes("dev") && rule.values.includes("staging"));
  const matchesTemplate = hasSelectorRequirements(selector) && matchesKubernetesSelector(selector, templateLabels);
  const correctPods = matches.length === 2 && matches.includes("web-dev") && matches.includes("web-staging");
  return {
    nodes: [node("Deployment selector", labelText(selector?.matchLabels) || (hasSelectorRequirements(selector) ? "Set-based selector" : "Add selector rules")),
      node("Matching sample Pods", matches.length ? matches.join(", ") : "None")],
    connected: matchesTemplate && matches.length > 0,
    summary: !matchesTemplate ? "The selector must match the Pod template labels." : matches.length + (matches.length === 1 ? " sample Pod matches." : " sample Pods match."),
    checks: [
      [deployment?.apiVersion === "apps/v1" && selector?.matchLabels?.app === "web", "Keep app: web under spec.selector.matchLabels."],
      [includesEnvironments, "Add an env In expression with the values dev and staging."],
      [correctPods, "Match only web-dev and web-staging in the sample Pods."],
      [templateLabels?.env === "staging" && matchesTemplate, "Keep env: staging on the Pod template and match its labels."],
    ],
  };
}

function inspectService(resource) {
  const service = resource?.kind === "Service" ? resource.manifest : null;
  const selector = service?.spec?.selector;
  const port = list(service?.spec?.ports).find((entry) => entry?.port === 80) ?? list(service?.spec?.ports)[0];
  const target = port?.targetPort ?? port?.port;
  const reachable = Number.isInteger(port?.port) && port.port >= 1 && port.port <= 65535
    && [backendPort.containerPort, backendPort.name].includes(target) && (port.protocol ?? "TCP") === "TCP";
  const checkedPort = port?.port === 80 && reachable;
  const matches = selector && Object.keys(selector).length > 0
    ? servicePracticePods.filter((pod) => resource.namespace === pod.metadata.namespace && matchesKubernetesSelector({ matchLabels: selector }, pod.metadata.labels))
    : [];
  const description = [service && resource.name, port && describePort(port.port) + " → " + describePort(target)].filter(Boolean).join(" · ");
  const connected = matches.length > 0 && reachable && service.spec?.type !== "ExternalName";
  const selectorDescription = labelText(selector);
  let summary;
  if (!service) summary = "Declare a Service to route traffic.";
  else if (resource.namespace !== "default") summary = "The sample Pods are in the default namespace.";
  else if (!selectorDescription) summary = "Add a selector to find the orders Pods.";
  else if (!matches.length) summary = "No Pods match " + selectorDescription + ".";
  else if (!connected) summary = "The Pods match. Check the Service type, protocol, and target port.";
  else summary = "Traffic on port " + port.port + " reaches both orders Pods.";

  return {
    nodes: [node("Service", description || "Add a Service"), node("Sample Pods", "app=orders")],
    connected,
    highlightSelector: Boolean(service && !matches.length),
    summary,
    checks: [
      [service?.apiVersion === "v1" && (service.spec?.type ?? "ClusterIP") === "ClusterIP", "Use a v1 ClusterIP Service."],
      [selector?.app === "orders" && matches.length === servicePracticePods.length, "Select the orders Pods in the default namespace with app: orders."],
      [checkedPort, "Forward TCP port 80 to targetPort: 8080 or http."],
    ],
  };
}

const inspections = { manifests: inspectPod, labels: inspectLabels, services: inspectService };

export function inspectKubeLabDraft(lessonId, { resources, issues, parseError, skippedDocuments }) {
  if (parseError) return { problem: "YAML parsing failed. " + parseError };
  if (resources.length !== 1 || skippedDocuments) return { problem: "Edit one Kubernetes manifest for this lesson. Include kind and metadata.name." };
  const result = inspections[lessonId](resources[0]);
  const failures = result.checks.filter(([passed]) => !passed).map(([, message]) => message);
  if (!failures.length) failures.push(...issues.filter((issue) => issue.severity === "error").map((issue) => issue.message));
  return { ...result, failures };
}
