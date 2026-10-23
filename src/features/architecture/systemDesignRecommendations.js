const DEFINITIONS = {
  SINGLE_REPLICA_CRITICAL_COMPONENT: {
    title: "Preview redundancy improvement",
    rationale: "A single replica can become unavailable during a process failure or maintenance event.",
    change: "Set replicas to at least 2",
    property: "replicas",
    value: 2,
  },
  SINGLE_ZONE_CRITICAL_COMPONENT: {
    title: "Preview multi-zone placement",
    rationale: "A single availability zone can be a failure domain for a critical component.",
    change: "Set availability zones to at least 2",
    property: "availabilityZones",
    value: 2,
  },
  ISOLATED_COMPONENT: {
    title: "Review component connectivity",
    rationale: "This component has no visible connections, so it may not participate in the modeled request or data flow.",
    change: "Select the component and connect it intentionally",
    property: null,
    value: null,
  },
};

export function getSystemDesignRecommendation(diagnostic) {
  if (!diagnostic || !DEFINITIONS[diagnostic.code]) return null;
  const definition = DEFINITIONS[diagnostic.code];
  return { diagnosticId: diagnostic.diagnosticId, code: diagnostic.code, ...definition, targetId: diagnostic.nodeIds?.[0] ?? null, requiresCanvasEdit: Boolean(definition.property) };
}

export function previewSystemDesignRecommendation(diagnostic, elements = []) {
  const recommendation = getSystemDesignRecommendation(diagnostic);
  if (!recommendation) return { applicable: false, reason: "No safe, supported action is available for this finding." };
  if (!recommendation.property) return { applicable: false, recommendation, reason: "This finding requires a deliberate diagram edit; no automatic connector is safe to infer." };
  const element = elements.find((item) => item?.id === recommendation.targetId && !item.isDeleted);
  if (!element) return { applicable: false, recommendation, reason: "The affected component no longer exists in the current diagram." };
  const metadata = element.customData?.systemDesign || element.customData?.architecture || {};
  const currentValue = Number(metadata[recommendation.property]);
  return { applicable: true, recommendation, currentValue: Number.isFinite(currentValue) ? currentValue : null, proposedValue: Math.max(Number.isFinite(currentValue) ? currentValue : 1, recommendation.value), targetName: element.text || metadata.name || element.type };
}

/** Pure helper: returns a new array and never mutates the input scene. */
export function applySystemDesignRecommendation(diagnostic, elements = []) {
  const preview = previewSystemDesignRecommendation(diagnostic, elements);
  if (!preview.applicable) return { applied: false, elements, reason: preview.reason };
  const { recommendation, proposedValue } = preview;
  const nextElements = elements.map((element) => {
    if (element?.id !== recommendation.targetId) return element;
    const currentCustomData = element.customData || {};
    const metadataKey = currentCustomData.systemDesign ? "systemDesign" : "architecture";
    const metadata = currentCustomData[metadataKey] || {};
    return { ...element, customData: { ...currentCustomData, [metadataKey]: { ...metadata, [recommendation.property]: proposedValue } } };
  });
  return { applied: true, elements: nextElements, reason: "Recommendation applied to the returned scene snapshot." };
}
