import { parseDocument } from "yaml";

/**
 * Apply a narrow change to the YAML syntax tree. Keep comments, extensions,
 * and unrelated mappings instead of rebuilding the Compose document.
 */
export function updateComposeServiceImage(yamlText, serviceName, nextImage) {
  const image = typeof nextImage === "string" ? nextImage.trim() : "";
  if (!image) throw new Error("Service image cannot be empty.");
  const document = parseDocument(yamlText, { uniqueKeys: true });
  if (document.errors.length) throw new Error(document.errors[0].message);
  if (!document.hasIn(["services", serviceName])) {
    throw new Error('Service "' + serviceName + '" no longer exists.');
  }
  document.setIn(["services", serviceName, "image"], image);
  return String(document);
}
