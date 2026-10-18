import { ensureLoadTestEvidenceDefaults } from "./loadTestCalibration.js";

/**
 * User-owned infrastructure context for synthetic Workbench simulations.
 * These fields describe the target deployment; they do not alter simulation
 * capacity math until a future calibrated capacity model consumes them.
 */
export const INFRASTRUCTURE_PROFILE_SCHEMA_VERSION = 1;

export const INFRASTRUCTURE_EVIDENCE_OPTIONS = Object.freeze([
  { value: "unknown", label: "Unknown" },
  { value: "deployment-configured", label: "Deployment config" },
  { value: "measured", label: "Measured" },
  { value: "user-estimated", label: "Estimate" },
  { value: "defaulted", label: "Defaulted" },
]);

const UNKNOWN = "unknown";

export const INFRASTRUCTURE_PROFILE_FIELD_DEFINITIONS = Object.freeze({
  "backend.rest-service": [
    { key: "deploymentPlatform", label: "Hosting platform / service", type: "text", placeholder: "e.g. Render, ECS, Kubernetes" },
    { key: "deploymentMode", label: "Deployment mode", type: "select", options: [
      { value: UNKNOWN, label: "Unknown" }, { value: "fixed-replicas", label: "Fixed replicas" },
      { value: "horizontal-autoscaling", label: "Horizontal autoscaling" }, { value: "serverless", label: "Serverless" },
    ] },
    { key: "replicaCount", label: "Current instance / replica count", type: "number", min: 1, max: 10000, step: 1, unit: "instances" },
    { key: "vCpuPerInstance", label: "vCPU per instance", type: "number", min: 0.1, max: 4096, step: 0.1 },
    { key: "memoryGbPerInstance", label: "RAM per instance (GB)", type: "number", min: 0.1, max: 1048576, step: 0.1 },
    { key: "minReplicas", label: "Autoscaling minimum replicas", type: "number", min: 1, max: 10000, step: 1 },
    { key: "maxReplicas", label: "Autoscaling maximum replicas", type: "number", min: 1, max: 10000, step: 1 },
    { key: "autoscaleCpuTargetPercent", label: "Autoscaling CPU target (%)", type: "number", min: 1, max: 100, step: 1 },
    { key: "maxWorkerThreads", label: "Application worker / thread limit", type: "number", min: 1, max: 1000000, step: 1 },
    { key: "requestTimeoutMs", label: "Request timeout (ms)", type: "number", min: 0, max: 3600000, step: 1 },
    { key: "dbPoolMaxConnectionsPerInstance", label: "DB pool max connections per instance", type: "number", min: 1, max: 1000000, step: 1 },
  ],
  "data.postgresql-database": [
    { key: "hostingModel", label: "Hosting model", type: "select", options: [
      { value: UNKNOWN, label: "Unknown" }, { value: "managed", label: "Managed database" },
      { value: "self-hosted", label: "Self-hosted VM / bare metal" }, { value: "container", label: "Containerized database" },
      { value: "serverless", label: "Serverless database" },
    ] },
    { key: "providerOrService", label: "Provider / database service", type: "text", placeholder: "e.g. Neon, RDS, Cloud SQL" },
    { key: "instanceClass", label: "Instance / compute tier", type: "text", placeholder: "Exact provider tier or machine type" },
    { key: "engineVersion", label: "PostgreSQL version", type: "text", placeholder: "e.g. PostgreSQL 17" },
    { key: "vCpu", label: "Allocated vCPU", type: "number", min: 0.1, max: 4096, step: 0.1 },
    { key: "memoryGb", label: "Allocated RAM (GB)", type: "number", min: 0.1, max: 1048576, step: 0.1 },
    { key: "storageGb", label: "Allocated storage (GB)", type: "number", min: 0.1, max: 104857600, step: 1 },
    { key: "storageType", label: "Storage type", type: "select", options: [
      { value: UNKNOWN, label: "Unknown" }, { value: "network-ssd", label: "Network SSD" },
      { value: "local-nvme", label: "Local NVMe" }, { value: "hdd", label: "HDD" },
      { value: "other", label: "Other / provider-managed" },
    ] },
    { key: "storageIops", label: "Provisioned / stated IOPS", type: "number", min: 1, max: 100000000, step: 1 },
    { key: "maxConnections", label: "Database max connections", type: "number", min: 1, max: 10000000, step: 1 },
    { key: "readReplicaCount", label: "Read replica count", type: "number", min: 0, max: 10000, step: 1 },
    { key: "highAvailability", label: "High availability", type: "select", options: [
      { value: UNKNOWN, label: "Unknown" }, { value: "single-instance", label: "Single instance" },
      { value: "primary-standby", label: "Primary + standby" }, { value: "multi-zone", label: "Multi-zone / regional HA" },
      { value: "provider-managed", label: "Provider-managed / not exposed" },
    ] },
  ],
});

function defaultFieldValue(field) {
  if (field.type === "select") return UNKNOWN;
  if (field.type === "number") return null;
  return "";
}

export function createUnknownInfrastructureProfile(entity) {
  const definitions = INFRASTRUCTURE_PROFILE_FIELD_DEFINITIONS[entity?.kind];
  if (!definitions) return null;
  const fields = {};
  for (const definition of definitions) {
    fields[definition.key] = { value: defaultFieldValue(definition), evidence: "unknown" };
  }
  return {
    schemaVersion: INFRASTRUCTURE_PROFILE_SCHEMA_VERSION,
    entityKind: entity.kind,
    fields,
  };
}

/** Add new fields to old profiles without overwriting any saved user values. */
export function ensureInfrastructureProfileDefaults(profile, workbench) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) return null;
  const next = structuredClone(profile);
  next.loadTestEvidence = ensureLoadTestEvidenceDefaults(next.loadTestEvidence);
  next.infrastructureByEntityId = next.infrastructureByEntityId && typeof next.infrastructureByEntityId === "object"
    && !Array.isArray(next.infrastructureByEntityId) ? next.infrastructureByEntityId : {};
  for (const entity of Array.isArray(workbench?.entities) ? workbench.entities : []) {
    const generated = createUnknownInfrastructureProfile(entity);
    if (!generated) continue;
    const existing = next.infrastructureByEntityId[entity.id];
    if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
      next.infrastructureByEntityId[entity.id] = generated;
      continue;
    }
    const merged = {
      ...generated,
      ...structuredClone(existing),
      schemaVersion: INFRASTRUCTURE_PROFILE_SCHEMA_VERSION,
      entityKind: entity.kind,
      fields: { ...generated.fields, ...(existing.fields && typeof existing.fields === "object" ? structuredClone(existing.fields) : {}) },
    };
    for (const definition of INFRASTRUCTURE_PROFILE_FIELD_DEFINITIONS[entity.kind]) {
      const saved = merged.fields[definition.key];
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
        merged.fields[definition.key] = generated.fields[definition.key];
      } else {
        merged.fields[definition.key] = {
          ...generated.fields[definition.key],
          ...saved,
          evidence: INFRASTRUCTURE_EVIDENCE_OPTIONS.some((option) => option.value === saved.evidence) ? saved.evidence : "unknown",
        };
      }
    }
    next.infrastructureByEntityId[entity.id] = merged;
  }
  return next;
}

export function updateInfrastructureField(profile, entityId, fieldKey, property, value) {
  if (!profile || !profile.infrastructureByEntityId?.[entityId]) throw new TypeError("Infrastructure profile is missing for this component.");
  if (!new Set(["value", "evidence"]).has(property)) throw new TypeError("Unsupported infrastructure profile field property.");
  const next = structuredClone(profile);
  const entry = next.infrastructureByEntityId[entityId];
  const current = entry.fields?.[fieldKey];
  if (!current) throw new TypeError(`Infrastructure field is not defined: ${fieldKey}.`);
  if (property === "evidence") {
    if (!INFRASTRUCTURE_EVIDENCE_OPTIONS.some((option) => option.value === value)) throw new TypeError("Unsupported infrastructure evidence source.");
    current.evidence = value;
  } else {
    current.value = value;
    const isEmpty = value === null || value === undefined || value === "" || value === UNKNOWN;
    current.evidence = isEmpty ? "unknown" : "user-estimated";
  }
  return next;
}

export function summarizeInfrastructureProfile(profile) {
  const definitions = INFRASTRUCTURE_PROFILE_FIELD_DEFINITIONS[profile?.entityKind] || [];
  const fields = profile?.fields || {};
  let populated = 0;
  let unknown = 0;
  const evidenceCounts = Object.fromEntries(INFRASTRUCTURE_EVIDENCE_OPTIONS.map((item) => [item.value, 0]));
  for (const definition of definitions) {
    const item = fields[definition.key] || {};
    const value = item.value;
    const hasValue = value !== null && value !== undefined && value !== "" && value !== UNKNOWN;
    if (hasValue) populated += 1;
    else unknown += 1;
    const evidence = INFRASTRUCTURE_EVIDENCE_OPTIONS.some((option) => option.value === item.evidence) ? item.evidence : "unknown";
    evidenceCounts[evidence] += 1;
  }
  return { total: definitions.length, populated, unknown, evidenceCounts };
}
