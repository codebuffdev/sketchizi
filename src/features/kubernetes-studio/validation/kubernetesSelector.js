const isMapping = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

export function hasSelectorRequirements(selector) {
  return (isMapping(selector?.matchLabels) && Object.keys(selector.matchLabels).length > 0)
    || (Array.isArray(selector?.matchExpressions) && selector.matchExpressions.length > 0);
}

export function matchesKubernetesSelector(selector, labels) {
  if (!isMapping(selector) || !isMapping(labels)) return false;
  const { matchLabels = {}, matchExpressions = [] } = selector;
  if (!isMapping(matchLabels) || !Array.isArray(matchExpressions)) return false;
  if (!Object.entries(matchLabels).every(([key, value]) =>
    typeof value === "string" && Object.hasOwn(labels, key) && labels[key] === value)) return false;

  return matchExpressions.every((expression) => {
    if (!isMapping(expression) || typeof expression.key !== "string" || !expression.key) return false;
    const { key, operator, values = [] } = expression;
    if (!Array.isArray(values) || !values.every((value) => typeof value === "string")) return false;
    const exists = Object.hasOwn(labels, key);
    switch (operator) {
      case "In": return values.length > 0 && exists && values.includes(labels[key]);
      case "NotIn": return values.length > 0 && (!exists || !values.includes(labels[key]));
      case "Exists": return values.length === 0 && exists;
      case "DoesNotExist": return values.length === 0 && !exists;
      default: return false;
    }
  });
}
