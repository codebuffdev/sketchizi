// Single source of truth for Sketchizi roles and privileges.
//
// NOTE: this is UI-level gating only. Anything that must be enforced (quotas,
// private repository access, admin tooling) has to be enforced by the backend;
// the browser can never be trusted to hold the line.

export const USER_ROLES = Object.freeze({ FREE: "free", PRO: "pro", ADMIN: "admin" });
const ROLE_RANK = { free: 0, pro: 1, admin: 2 };

// Granular features, grouped by product area. Each tier lists only what it adds;
// higher tiers inherit everything below them.
const FREE_GRANTS = [
  "workspace.projects",            // up to 3 projects / 50 MB
  "github.publicRepo",             // 1 public repo
  "github.readOnlyExport",
  "ai.generate",                   // daily starter credit cap
  "systemDesign.coreBlueprints",
  "systemDesign.basicSimulation",
  "collab.guests",                 // up to 3 guests
  "export.standard",               // PNG / SVG / JSON
];
const PRO_GRANTS = [
  "workspace.unlimitedProjects",
  "workspace.versionHistory",
  "github.privateRepos",
  "github.autoCommitSync",
  "github.branchSelector",
  "ai.priorityModels",
  "ai.highQuota",
  "systemDesign.fullBlueprintLibrary",
  "systemDesign.customTrafficProfiles",
  "systemDesign.reportExport",
  "collab.unlimitedCollaborators",
  "collab.rolePermissions",
  "collab.persistentLinks",
  "export.highDpi",
  "export.transparent",
  "export.pdf",
  "export.watermarkFree",
];
const ADMIN_GRANTS = [
  "workspace.quotaInspector",
  "github.buildTelemetry",
  "ai.unrestrictedQuota",
  "ai.diagnostics",
  "systemDesign.blueprintCuration",
  "systemDesign.simulationMetrics",
  "collab.roomModeration",
  "collab.connectionHealth",
  "export.rawStateInspector",
  "admin.buildInfo",
];

const freeFeatures = new Set(FREE_GRANTS);
const proFeatures = new Set([...freeFeatures, ...PRO_GRANTS]);
const adminFeatures = new Set([...proFeatures, ...ADMIN_GRANTS]);

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const ROLE_PRIVILEGES = Object.freeze({
  free: Object.freeze({
    label: "FREE",
    summary: "3 projects · 50 MB",
    features: freeFeatures,
    limits: Object.freeze({ maxProjects: 3, storageBytes: 50 * MB, maxCollabGuests: 3, maxGithubRepos: 1, githubPublicOnly: true, aiQuota: "daily-starter" }),
    areas: Object.freeze({
      cloudWorkspace: "Up to 3 projects / 50 MB",
      githubSync: "1 public repo, read-only export",
      ai: "Daily starter credit cap",
      systemDesign: "Core blueprints + basic simulation",
      collab: "Up to 3 guests",
      exportStudio: "Standard PNG / SVG / JSON",
    }),
  }),
  pro: Object.freeze({
    label: "PRO",
    summary: "Unlimited · 5 GB",
    features: proFeatures,
    limits: Object.freeze({ maxProjects: Infinity, storageBytes: 5 * GB, maxCollabGuests: Infinity, maxGithubRepos: Infinity, githubPublicOnly: false, aiQuota: "monthly-high" }),
    areas: Object.freeze({
      cloudWorkspace: "Unlimited projects / 5 GB + version history",
      githubSync: "Unlimited private & public repos, auto-commit sync, branch selector",
      ai: "Priority models, high monthly quota",
      systemDesign: "Full blueprint library, custom traffic load profiles, report export",
      collab: "Unlimited collaborators, role permissions, persistent links",
      exportStudio: "High-DPI, transparent, PDF, watermark-free",
    }),
  }),
  admin: Object.freeze({
    label: "ADMIN",
    summary: "Unlimited · Debug",
    features: adminFeatures,
    limits: Object.freeze({ maxProjects: Infinity, storageBytes: Infinity, maxCollabGuests: Infinity, maxGithubRepos: Infinity, githubPublicOnly: false, aiQuota: "unrestricted" }),
    areas: Object.freeze({
      cloudWorkspace: "Unlimited + quota / flag inspector",
      githubSync: "Full sync + build telemetry",
      ai: "Unrestricted quota + latency / prompt diagnostics",
      systemDesign: "Blueprint curation + simulation metrics",
      collab: "Room moderation + connection health",
      exportStudio: "Full export + raw canvas state JSON inspector",
    }),
  }),
});

const FEATURE_MIN_ROLE = {};
for (const role of ["admin", "pro", "free"]) {
  for (const feature of ROLE_PRIVILEGES[role].features) FEATURE_MIN_ROLE[feature] = role;
}

export const isUserRole = (value) => typeof value === "string" && Object.hasOwn(ROLE_RANK, value);

function readAdminEmailAllowlist() {
  const raw = import.meta.env?.VITE_ADMIN_EMAILS;
  return typeof raw === "string" ? raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean) : [];
}

/**
 * Resolves a user profile to a UserRole. Admin = profile role "admin" or an email in
 * the VITE_ADMIN_EMAILS allowlist (visible in the client bundle: a UI convenience,
 * never a security boundary). Pro = profile role/plan/tier "pro". Everything else,
 * including anonymous, is free.
 */
export function resolveUserRole(user, adminEmails = readAdminEmailAllowlist()) {
  if (!user || typeof user !== "object") return USER_ROLES.FREE;
  const declared = String(user.role ?? "").toLowerCase();
  if (declared === "admin") return USER_ROLES.ADMIN;
  const email = typeof user.email === "string" ? user.email.trim().toLowerCase() : "";
  if (email && adminEmails.map((e) => e.toLowerCase()).includes(email)) return USER_ROLES.ADMIN;
  if (declared === "pro" || ["pro"].includes(String(user.plan ?? user.tier ?? "").toLowerCase())) return USER_ROLES.PRO;
  return USER_ROLES.FREE;
}

export function canAccessFeature(role, feature) {
  const privileges = ROLE_PRIVILEGES[isUserRole(role) ? role : USER_ROLES.FREE];
  return privileges.features.has(feature);
}

/** Gate result for UI: { allowed, reason, upgradeTarget }. Unknown features are denied. */
export function evaluatePrivilegeGate(role, feature) {
  const effectiveRole = isUserRole(role) ? role : USER_ROLES.FREE;
  if (canAccessFeature(effectiveRole, feature)) return { allowed: true, reason: "", upgradeTarget: null };
  const required = FEATURE_MIN_ROLE[feature];
  if (!required) return { allowed: false, reason: "Unknown feature.", upgradeTarget: null };
  if (required === USER_ROLES.ADMIN) return { allowed: false, reason: "This tool is restricted to administrators.", upgradeTarget: null };
  return { allowed: false, reason: "This feature is available on the Pro plan.", upgradeTarget: USER_ROLES.PRO };
}
