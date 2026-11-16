export const DESIGN_EXTENSION_KEY = "design";
export const DESIGN_SCHEMA_VERSION = 1;

export const DESIGN_DOMAINS = Object.freeze([
  { id: "general", label: "General design" },
  { id: "software-architecture", label: "Software architecture" },
  { id: "process-flow", label: "Process flow" },
  { id: "uml", label: "UML" },
  { id: "database", label: "Database / ERD" },
  { id: "cloud-infrastructure", label: "Cloud infrastructure" },
  { id: "network-topology", label: "Network topology" },
  { id: "ui-design", label: "UI / product design" },
]);

export function createDesignProfile({
  name = "Untitled design",
  domain = "general",
  creationMode = "blank",
  templateId = null,
  templateVersion = null,
  ruleMode = "guided",
  templateOptions = {},
} = {}) {
  return {
    schemaVersion: DESIGN_SCHEMA_VERSION,
    name: String(name || "Untitled design").trim().slice(0, 120) || "Untitled design",
    domain: DESIGN_DOMAINS.some((item) => item.id === domain) ? domain : "general",
    creationMode: ["blank", "template", "pattern"].includes(creationMode) ? creationMode : "blank",
    templateId: typeof templateId === "string" && templateId ? templateId : null,
    templateVersion: Number.isInteger(templateVersion) ? templateVersion : null,
    ruleMode: ruleMode === "strict" ? "strict" : "guided",
    templateOptions: {
      includeCache: templateOptions?.includeCache === true,
      region: typeof templateOptions?.region === "string" ? templateOptions.region.trim().slice(0, 40) : "",
      environment: typeof templateOptions?.environment === "string" ? templateOptions.environment.trim().slice(0, 40) : "",
    },
  };
}

export function readDesignProfile(extensions = {}) {
  const value = extensions?.[DESIGN_EXTENSION_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return createDesignProfile(value);
}

export function withDesignProfile(extensions = {}, profile) {
  const next = extensions && typeof extensions === "object" && !Array.isArray(extensions) ? { ...extensions } : {};
  if (profile) next[DESIGN_EXTENSION_KEY] = createDesignProfile(profile);
  else delete next[DESIGN_EXTENSION_KEY];
  return next;
}
