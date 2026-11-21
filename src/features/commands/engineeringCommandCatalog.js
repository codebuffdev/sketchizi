import { awsIcons } from "../../awsArchitectureLibrary.js";
import { kubernetesIcons } from "../../kubernetesArchitectureLibrary.js";
import { networkingResourceDefinitions } from "../../networkingResourceDefinitions.js";
import { networkingIconSvg } from "../networking/networkingIconArtwork.js";

export const COMMAND_CATEGORY_INSERT = "Insert Cloud & Infra";
export const COMMAND_CATEGORY_STUDIOS = "Studios & Validation";
export const COMMAND_CATEGORY_TEMPLATES = "Templates & Packs";

// [short name, label, icon id prefix, keywords]
const AWS_TARGETS = [
  ["ec2", "EC2", "aws:service:compute:amazon-ec2:", ["compute", "virtual machine", "instance", "server"]],
  ["s3", "S3", "aws:service:storage:amazon-simple-storage-service:", ["storage", "bucket", "object", "simple storage service"]],
  ["rds", "RDS", "aws:service:databases:amazon-rds:", ["database", "sql", "relational"]],
  ["vpc", "VPC", "aws:service:networking-content-delivery:amazon-virtual-private-cloud:", ["network", "virtual private cloud", "subnet"]],
  ["eks", "EKS", "aws:service:containers:amazon-elastic-kubernetes-service:", ["kubernetes", "k8s", "containers", "elastic kubernetes service"]],
  ["lambda", "Lambda", "aws:service:compute:aws-lambda:", ["serverless", "function", "compute"]],
];

// [id suffix, label, keywords]
const KUBERNETES_TARGETS = [
  ["pod", "Pod", ["workload", "container"]],
  ["deployment", "Deployment", ["workload", "replicas", "rollout"]],
  ["service", "Service", ["network", "clusterip", "load balancer"]],
  ["ingress", "Ingress", ["network", "http", "route", "gateway"]],
  ["configmap", "ConfigMap", ["configuration", "config", "settings"]],
];

function findAwsIcon(prefix) {
  return awsIcons.find((icon) => icon.id.startsWith(prefix)) || null;
}

function findKubernetesIcon(suffix) {
  return kubernetesIcons.find((icon) => icon.id === `k8s:${suffix}`) || null;
}

function buildNetworkingIcon(definition) {
  return {
    id: definition.iconId,
    name: definition.displayName,
    subtitle: "Networking resource · editable metadata",
    category: "Networking",
    source: "networking",
    src: `data:image/svg+xml,${encodeURIComponent(networkingIconSvg(definition.resourceType))}`,
  };
}

/**
 * Quick-insert targets for the command palette. Each target pairs a stable
 * command id and search keywords with the real catalog icon object, so the
 * existing intelligent-resource insertion (AWS / Kubernetes / Networking
 * metadata) runs exactly as it does from the icon library.
 */
export function getInfrastructureInsertTargets() {
  const targets = [];

  for (const [key, label, prefix, keywords] of AWS_TARGETS) {
    const icon = findAwsIcon(prefix);
    if (!icon) continue;
    targets.push({
      id: `insert.aws.${key}`,
      provider: "aws",
      label: `Insert AWS ${label}`,
      description: `Place ${icon.name} at the center of the viewport`,
      keywords: ["aws", "amazon", "cloud", "insert", "add", key, label.toLowerCase(), ...keywords],
      icon,
    });
  }

  for (const [key, label, keywords] of KUBERNETES_TARGETS) {
    const icon = findKubernetesIcon(key);
    if (!icon) continue;
    targets.push({
      id: `insert.kubernetes.${key}`,
      provider: "kubernetes",
      label: `Insert Kubernetes ${label}`,
      description: `Place a Kubernetes ${label} at the center of the viewport`,
      keywords: ["kubernetes", "k8s", "insert", "add", key, label.toLowerCase(), ...keywords],
      icon,
    });
  }

  for (const definition of networkingResourceDefinitions) {
    const icon = buildNetworkingIcon(definition);
    const key = String(definition.id).replace(/^networking:/, "");
    targets.push({
      id: `insert.networking.${key}`,
      provider: "networking",
      label: `Insert Network ${definition.displayName}`,
      description: `Place a ${definition.displayName} networking node at the center of the viewport`,
      keywords: ["network", "networking", "insert", "add", key.replace(/-/g, " "), definition.displayName.toLowerCase()],
      icon,
    });
  }

  return targets;
}

export const INFRASTRUCTURE_PROVIDER_GLYPHS = Object.freeze({ aws: "☁", kubernetes: "⎈", networking: "⇄" });
