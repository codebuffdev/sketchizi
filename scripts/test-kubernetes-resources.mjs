import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import {
  kubernetesResourceDefinitions,
  getKubernetesResourceDefinitionById,
  getKubernetesResourceDefinitionForIcon,
  getKubernetesResourceDefaults,
} from "../src/kubernetesResourceDefinitions.js";
import { applyKubernetesResourcePatch } from "../src/kubernetesResourceDefinitions.js";
import { awsIcons } from "../src/awsArchitectureLibrary.js";
import { kubernetesIcons } from "../src/kubernetesArchitectureLibrary.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };

const expected = [
  ["k8s:cluster", "cluster", "k8s:group"],
  ["k8s:namespace", "namespace", "k8s:namespace"],
  ["k8s:node", "node", "k8s:node"],
  ["k8s:pod", "pod", "k8s:pod"],
  ["k8s:deployment", "deployment", "k8s:deployment"],
  ["k8s:statefulset", "statefulset", "k8s:statefulset"],
  ["k8s:daemonset", "daemonset", "k8s:daemonset"],
  ["k8s:service", "service", "k8s:service"],
];

check(kubernetesResourceDefinitions.length === 8, `Expected 8 Kubernetes resource definitions, found ${kubernetesResourceDefinitions.length}.`);
check(new Set(kubernetesResourceDefinitions.map((definition) => definition.id)).size === 8, "Kubernetes resource definition IDs are not unique.");
check(kubernetesResourceDefinitions.every((definition) => definition.id.startsWith("k8s:")), "All Kubernetes resource definition IDs must use k8s: namespace.");
check(kubernetesResourceDefinitions.every((definition) => definition.provider === "kubernetes"), "All Kubernetes resources must use provider=\"kubernetes\".");

for (const [id, resourceType, iconId] of expected) {
  const definition = getKubernetesResourceDefinitionById(id);
  check(definition, `Missing Kubernetes definition: ${id}`);
  check(definition?.resourceType === resourceType, `${id} has incorrect resourceType.`);
  check(definition?.iconId === iconId, `${id} has incorrect iconId.`);
  check(kubernetesIcons.some((icon) => icon.id === iconId), `${id} references a non-catalog Kubernetes icon: ${iconId}`);
}


for (const definition of kubernetesResourceDefinitions) {
  const defaults = getKubernetesResourceDefaults(definition);
  for (const property of definition.properties) {
    check(Object.hasOwn(defaults, property.key), `${definition.id} is missing default for ${property.key}.`);
    if (property.type === "select") {
      check(Array.isArray(property.options) && property.options.length > 0, `${definition.id}.${property.key} has invalid select options.`);
      check(property.options.includes(property.defaultValue), `${definition.id}.${property.key} default is not one of its select options.`);
    }
    if (property.type === "number") check(typeof property.defaultValue === "number", `${definition.id}.${property.key} must have a numeric default.`);
  }
}

const original = {
  definitionId: "k8s:deployment",
  kubernetesResourceId: "kubernetes-resource-stable",
  provider: "kubernetes",
  resourceType: "deployment",
  iconId: "k8s:deployment",
  catalog: "kubernetes",
  properties: { name: "Deployment", namespace: "default", replicas: 1, environment: "development" },
};
const renamed = applyKubernetesResourcePatch(original, { name: "orders" });
check(renamed.kubernetesResourceId === original.kubernetesResourceId, "Name update changed kubernetesResourceId.");
check(renamed.definitionId === original.definitionId, "Property update changed definitionId.");
check(renamed.provider === original.provider, "Property update changed provider.");
check(renamed.resourceType === original.resourceType, "Property update changed resourceType.");
check(renamed.iconId === original.iconId, "Property update changed iconId.");
check(renamed.catalog === original.catalog, "Property update changed catalog.");
check(renamed.properties.name === "orders", "Name property did not update.");

const moved = { ...renamed, x: 900, y: 700 };
check(moved.kubernetesResourceId === renamed.kubernetesResourceId, "Movement changed kubernetesResourceId.");

const nonIntelligent = kubernetesIcons.filter((icon) => !getKubernetesResourceDefinitionForIcon(icon));
check(nonIntelligent.length === 30, `Expected 30 non-intelligent Kubernetes icons, found ${nonIntelligent.length}.`);
check(nonIntelligent.every((icon) => !kubernetesResourceDefinitions.some((definition) => definition.iconId === icon.id)), "A non-intelligent Kubernetes icon is mapped to an intelligent definition.");

check(awsIcons.length > 0, "AWS catalog could not be loaded.");
check(awsIcons.every((icon) => icon.id.startsWith("aws:")), "AWS catalog contains a non-AWS ID.");
check(!kubernetesResourceDefinitions.some((definition) => definition.id.startsWith("aws:")), "Kubernetes definitions contain AWS IDs.");
check(!kubernetesResourceDefinitions.some((definition) => awsIcons.some((icon) => icon.id === definition.iconId)), "Kubernetes resource icon collides with an AWS icon.");

const resourceService = fs.readFileSync(path.join(root, "src", "features", "kubernetes-resources", "kubernetesResourceService.js"), "utf8");
check(/createKubernetesResourceId/.test(resourceService), "Kubernetes resource service is missing stable resource ID generation.");
check(/kubernetes-resource-/.test(resourceService), "Kubernetes resource ID prefix is missing.");

const generatedIdPattern = /kubernetes-resource-\$\{crypto\.randomUUID\(\)\}/;
check(generatedIdPattern.test(resourceService), "Kubernetes UUID-based resource ID generation is missing.");

const insertionService = fs.readFileSync(path.join(root, "src/features/icon-library/iconInsertionService.js"), "utf8");
const persistence = fs.readFileSync(path.join(root, "src/persistence.js"), "utf8");
const scene = fs.readFileSync(path.join(root, "src/features/canvas/useExcalidrawScene.js"), "utf8");
const graph = fs.readFileSync(path.join(root, "src/features/architecture/architectureGraphService.js"), "utf8");
const validation = fs.readFileSync(path.join(root, "src/features/architecture/architectureValidationService.js"), "utf8");
const awsRules = fs.readFileSync(path.join(root, "src/features/architecture/awsArchitectureRules.js"), "utf8");

check(/isIntelligentKubernetesResourceIcon/.test(insertionService) && /insertKubernetesResource/.test(insertionService), "Generic icon insertion is missing the K2 Kubernetes integration point.");
check(!/kubernetesRelationship/i.test(insertionService), "Kubernetes relationship metadata was added during K2.");
check(!/kubernetesResource/i.test(persistence), "Kubernetes-specific persistence was added.");
check(!/kubernetesResource/i.test(scene), "Kubernetes-specific canvas scene logic was added.");
check(!/kubernetesResource/i.test(validation), "Kubernetes resource logic was added to architectureValidationService.js.");
check(!/kubernetesResource/i.test(awsRules), "Kubernetes resource logic was added to AWS architecture rules.");

console.log(`Kubernetes resource tests: ${failures.length ? "FAIL" : "PASS (8 intelligent definitions)"}`);
if (failures.length) {
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
