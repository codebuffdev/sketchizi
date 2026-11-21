/**
 * Scene-aware infrastructure detection for the "Smart Studio" pill.
 *
 * Pure and dependency-free so it can be unit-tested in Node and reused by the
 * command palette. Excalidraw elements stay the source of truth; nothing here
 * mutates the scene.
 */

export const ARCHITECTURE_CONTEXTS = Object.freeze({
  NONE: null,
  KUBERNETES: "kubernetes",
  DOCKER: "docker",
  ARCHITECTURE: "architecture",
  MULTI_CLOUD: "multi-cloud",
});

const FAMILY_KUBERNETES = "kubernetes";
const FAMILY_DOCKER = "docker";
const FAMILY_ARCHITECTURE = "architecture";

const EMPTY_DETECTION = Object.freeze({
  context: null,
  counts: Object.freeze({ kubernetes: 0, docker: 0, architecture: 0 }),
  infrastructureNodeCount: 0,
});

export function getEmptyArchitectureDetection() {
  return EMPTY_DETECTION;
}

function isLive(element) {
  return Boolean(element) && element.isDeleted !== true && element.deleted !== true;
}

/**
 * Returns the infrastructure family for a single scene element, or null for
 * plain sketches, notes, arrows and relationship metadata.
 */
export function classifyInfrastructureElement(element) {
  if (!isLive(element)) return null;
  const data = element.customData;
  if (!data || typeof data !== "object") return null;

  // Resource metadata is written by the Kubernetes, AWS and Networking
  // resource services and by the Docker Compose diagram generator.
  if (data.kubernetesResource || data.kubernetesManifestResource) return FAMILY_KUBERNETES;
  if (data.composeResource || data.composeDiagram) return FAMILY_DOCKER;
  if (data.awsResource || data.networkingResource) return FAMILY_ARCHITECTURE;

  // Catalog icons that have no intelligent resource definition still carry
  // their provider in iconSource / iconId.
  const source = typeof data.iconSource === "string" ? data.iconSource : "";
  const iconId = typeof data.iconId === "string" ? data.iconId : "";
  if (source === "kubernetes" || iconId.startsWith("k8s:")) return FAMILY_KUBERNETES;
  if (source === "docker-compose" || source === "compose") return FAMILY_DOCKER;
  if (source === "aws" || source === "networking" || iconId.startsWith("aws:") || iconId.startsWith("networking:")) {
    return FAMILY_ARCHITECTURE;
  }
  return null;
}

/**
 * Inspect the live scene and decide which Studio context applies.
 *
 *   kubernetes   -> only Kubernetes nodes
 *   docker       -> only Docker / Compose nodes
 *   architecture -> only AWS / Networking nodes
 *   multi-cloud  -> nodes from two or more families
 *   null         -> plain sketch or notes (render nothing)
 */
export function detectArchitectureContext(elements) {
  const scene = Array.isArray(elements) ? elements : [];
  const counts = { kubernetes: 0, docker: 0, architecture: 0 };
  for (const element of scene) {
    const family = classifyInfrastructureElement(element);
    if (family) counts[family] += 1;
  }
  const families = Object.keys(counts).filter((family) => counts[family] > 0);
  const infrastructureNodeCount = counts.kubernetes + counts.docker + counts.architecture;
  if (families.length === 0) return EMPTY_DETECTION;

  let context;
  if (families.length > 1) context = ARCHITECTURE_CONTEXTS.MULTI_CLOUD;
  else if (families[0] === FAMILY_KUBERNETES) context = ARCHITECTURE_CONTEXTS.KUBERNETES;
  else if (families[0] === FAMILY_DOCKER) context = ARCHITECTURE_CONTEXTS.DOCKER;
  else context = ARCHITECTURE_CONTEXTS.ARCHITECTURE;

  return { context, counts, infrastructureNodeCount };
}

export function architectureDetectionSignature(detection) {
  if (!detection?.context) return "none";
  const { kubernetes, docker, architecture } = detection.counts;
  return `${detection.context}:${kubernetes}:${docker}:${architecture}`;
}

const PILL_PRESENTATION = Object.freeze({
  kubernetes: { label: "K8s Studio", icon: "kubernetes", title: "Kubernetes Studio and validation" },
  docker: { label: "Compose Studio", icon: "docker", title: "Docker Compose Studio and validation" },
  architecture: { label: "Validate Arch", icon: "architecture", title: "Validate this architecture" },
  "multi-cloud": { label: "Validate Arch", icon: "architecture", title: "Validate this multi-platform architecture" },
});

export function getSmartStudioPresentation(context) {
  return PILL_PRESENTATION[context] || null;
}
