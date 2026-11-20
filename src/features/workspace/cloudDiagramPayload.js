const DIAGRAM_RECORD_KEYS = ["id", "name", "title", "filename", "document", "content", "documentJson", "document_json"];

// A diagram record (or the document itself) must never be unwrapped further:
// `{ id, name, data: { elements } }` carries the document in `data` and its
// own display name next to it. Only pure envelopes such as
// `{ success, data: { diagram } }` are descended into.
const isDiagramRecord = (value) => DIAGRAM_RECORD_KEYS.some((key) => value?.[key] !== undefined && value?.[key] !== null);
const isDocumentLike = (value) => Boolean(value) && typeof value === "object" && Array.isArray(value.elements);

const unwrapDiagram = (payload) => {
  let value = payload;
  for (let depth = 0; depth < 3; depth += 1) {
    if (value?.diagram && typeof value.diagram === "object") value = value.diagram;
    else if (
      value?.data && typeof value.data === "object" && !Array.isArray(value.data)
      && !isDiagramRecord(value) && !isDocumentLike(value.data)
    ) value = value.data;
    else break;
  }
  return value;
};

const parseDocument = (value) => {
  let document = value;
  if (typeof document === "string") {
    try { document = JSON.parse(document); }
    catch { throw new Error("The cloud file returned invalid document JSON."); }
  }
  if (document?.document && typeof document.document === "object") document = document.document;
  if (typeof document === "string") {
    try { document = JSON.parse(document); }
    catch { throw new Error("The cloud file returned invalid document JSON."); }
  }
  return document;
};

export function normalizeCloudDiagramResponse(payload, diagramId, { fallbackName = "" } = {}) {
  const diagram = unwrapDiagram(payload);
  const rawDocument = diagram?.document ?? diagram?.content ?? diagram?.documentJson
    ?? diagram?.document_json ?? diagram?.data;
  const document = parseDocument(rawDocument);
  if (!document || !Array.isArray(document.elements)) {
    throw new Error("The selected cloud file did not return a valid Sketchizi document. Please retry opening it.");
  }
  const name = [diagram?.name, diagram?.title, diagram?.filename, fallbackName]
    .find((candidate) => typeof candidate === "string" && candidate.trim())?.trim() || "Untitled cloud file";
  return { diagram: { ...diagram, id: diagram?.id || diagramId, name }, document, name };
}
