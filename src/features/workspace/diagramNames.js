export function normalizeDiagramName(name) {
  return String(name ?? "").trim().replace(/\\s+/g, " ").toLocaleLowerCase();
}

export function findDuplicateDiagramName(diagrams, name, excludeId = null) {
  const normalized = normalizeDiagramName(name);
  if (!normalized) return null;
  return (Array.isArray(diagrams) ? diagrams : []).find((diagram) =>
    diagram && diagram.id !== excludeId && normalizeDiagramName(diagram.name) === normalized
  ) || null;
}
