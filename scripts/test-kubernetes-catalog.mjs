import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { kubernetesIcons, kubernetesCategories } from "../src/kubernetesArchitectureLibrary.js";
import { awsIcons } from "../src/awsArchitectureLibrary.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const officialDir = path.join(root, "public", "kubernetes-icons");
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const officialFiles = [
  "k8s--api-server.svg", "k8s--cloud-controller-manager.svg", "k8s--clusterrole.svg", "k8s--clusterrolebinding.svg",
  "k8s--configmap.svg", "k8s--controller-manager.svg", "k8s--cronjob.svg", "k8s--customresourcedefinition.svg",
  "k8s--daemonset.svg", "k8s--deployment.svg", "k8s--endpoints.svg", "k8s--etcd-cluster.svg", "k8s--group.svg",
  "k8s--horizontalpodautoscaler.svg", "k8s--ingress.svg", "k8s--job.svg", "k8s--kube-proxy.svg", "k8s--kubelet.svg",
  "k8s--limitrange.svg", "k8s--namespace.svg", "k8s--networkpolicy.svg", "k8s--persistentvolume.svg",
  "k8s--persistentvolumeclaim.svg", "k8s--pod.svg", "k8s--podsecuritypolicy.svg", "k8s--replicaset.svg",
  "k8s--resourcequota.svg", "k8s--role.svg", "k8s--rolebinding.svg", "k8s--scheduler.svg", "k8s--secret.svg",
  "k8s--service.svg", "k8s--serviceaccount.svg", "k8s--statefulset.svg", "k8s--storageclass.svg", "k8s--user.svg",
  "k8s--volume.svg", "k8s--worker-node.svg",
];

const validCategories = new Set(kubernetesCategories);
const entriesByAsset = new Map();
for (const entry of kubernetesIcons) {
  const file = entry.src.split("/").pop();
  if (!entriesByAsset.has(file)) entriesByAsset.set(file, []);
  entriesByAsset.get(file).push(entry);
}

assert(kubernetesIcons.length === 38, `Expected exactly 38 Kubernetes catalog entries, found ${kubernetesIcons.length}.`);
assert(officialFiles.length === 38, `Test source list must contain exactly 38 supplied official SVGs, found ${officialFiles.length}.`);
assert(new Set(officialFiles).size === officialFiles.length, "Official SVG source list contains duplicates.");
assert(new Set(kubernetesIcons.map((entry) => entry.id)).size === kubernetesIcons.length, "Kubernetes catalog contains duplicate IDs.");
assert(kubernetesIcons.every((entry) => entry.id.startsWith("k8s:")), "Every Kubernetes ID must use the k8s: namespace.");
assert(kubernetesIcons.every((entry) => !entry.id.startsWith("aws:")), "Kubernetes catalog contains an AWS-namespaced ID.");
assert(kubernetesIcons.every((entry) => entry.source === "kubernetes"), "Every entry must use the Kubernetes source.");
assert(kubernetesIcons.every((entry) => entry.catalog === "kubernetes-architecture"), "Every entry must use the Kubernetes catalog ID.");
assert(kubernetesIcons.every((entry) => validCategories.has(entry.category)), "An entry uses a category outside the Kubernetes category set.");
assert(kubernetesCategories.includes("Access Control"), "Missing Access Control category.");

for (const file of officialFiles) {
  const entries = entriesByAsset.get(file) || [];
  assert(entries.length === 1, `${file} must have exactly one catalog entry; found ${entries.length}.`);
  assert(fs.existsSync(path.join(officialDir, file)), `Missing supplied official asset: ${file}`);
}

assert(entriesByAsset.size === 38, `Expected 38 unique referenced Kubernetes assets, found ${entriesByAsset.size}.`);
assert(kubernetesIcons.every((entry) => Array.isArray(entry.searchAliases) && entry.searchAliases.length > 0), "Every Kubernetes entry must have search metadata.");
assert(kubernetesIcons.every((entry) => entry.searchAliases.includes("kubernetes") && entry.searchAliases.includes("k8s")), "Every Kubernetes entry must include Kubernetes search aliases.");

const requiredAliases = {
  ClusterRole: ["clusterrole", "cluster role"],
  ClusterRoleBinding: ["clusterrolebinding", "cluster role binding"],
  CustomResourceDefinition: ["crd", "custom resource definition"],
  HorizontalPodAutoscaler: ["hpa", "horizontal pod autoscaler"],
  PersistentVolume: ["pv", "persistent volume"],
  PersistentVolumeClaim: ["pvc", "persistent volume claim"],
  ServiceAccount: ["sa", "service account"],
  NetworkPolicy: ["network policy", "networkpolicy"],
};
for (const [name, aliases] of Object.entries(requiredAliases)) {
  const entry = kubernetesIcons.find((item) => item.name === name);
  assert(entry, `Missing canonical entry: ${name}`);
  for (const alias of aliases) assert(entry?.searchAliases.includes(alias), `${name} is missing search alias: ${alias}`);
}

assert(awsIcons.length > 0, "AWS catalog could not be loaded.");
assert(awsIcons.every((entry) => entry.id.startsWith("aws:")), "AWS catalog contains a non-AWS ID after Kubernetes integration.");
assert(!kubernetesIcons.some((k8s) => awsIcons.some((aws) => aws.id === k8s.id)), "Kubernetes ID collides with an AWS ID.");
assert(!kubernetesIcons.some((entry) => entry.src.includes("/aws-icons/")), "Kubernetes catalog references AWS assets.");
assert(!kubernetesIcons.some((entry) => entry.src.includes("/icons/")), "Kubernetes catalog references the legacy public/icons namespace.");

const insertionService = fs.readFileSync(path.join(root, "src", "features", "icon-library", "iconInsertionService.js"), "utf8");
const insertionHook = fs.readFileSync(path.join(root, "src", "features", "icon-library", "useIconInsertion.js"), "utf8");
assert(/isIntelligentKubernetesResourceIcon/.test(insertionService), "K2 Kubernetes insertion integration is missing from the generic insertion service.");
assert(/insertKubernetesResource/.test(insertionService), "K2 Kubernetes resource insertion is missing from the generic insertion service.");
assert(!/kubernetes/i.test(insertionHook), "useIconInsertion.js contains Kubernetes-specific logic.");

console.log(`Kubernetes catalog tests: ${failures.length ? "FAIL" : `PASS (${kubernetesIcons.length} official SVG entries)`}`);
if (failures.length) {
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
