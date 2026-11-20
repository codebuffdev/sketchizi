export function normalizeDiagramName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function findDuplicateDiagramName(diagrams, name, excludeId = null) {
  const normalized = normalizeDiagramName(name);
  if (!normalized) return null;
  return (Array.isArray(diagrams) ? diagrams : []).find((diagram) =>
    diagram && diagram.id !== excludeId && normalizeDiagramName(diagram.name) === normalized
  ) || null;
}

export function readDiagramRows(value) {
  if (Array.isArray(value)) return value;
  const rows = [value?.diagrams, value?.data, value?.data?.diagrams, value?.items, value?.results]
    .find(Array.isArray);
  if (!rows) throw new Error("The Workspace returned an unsupported diagrams list.");
  return rows;
}
