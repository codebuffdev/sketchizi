import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROLE_PRIVILEGES, USER_ROLES, canAccessFeature, evaluatePrivilegeGate, resolveUserRole } from "../src/config/privileges.js";
import { DEV_LOCAL_HASH, getBuildMetadata, resolveBuildMetadata } from "../src/config/buildMetadata.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("role resolution: profile role, admin allowlist, plan fallback, anonymous", () => {
  assert.equal(resolveUserRole(null), "free");
  assert.equal(resolveUserRole({ email: "a@b.co" }, []), "free");
  assert.equal(resolveUserRole({ role: "pro" }, []), "pro");
  assert.equal(resolveUserRole({ plan: "PRO" }, []), "pro");
  assert.equal(resolveUserRole({ role: "ADMIN" }, []), "admin");
  assert.equal(resolveUserRole({ email: "Boss@Example.com" }, ["boss@example.com"]), "admin");
  assert.equal(resolveUserRole({ role: "pro", email: "boss@example.com" }, ["boss@example.com"]), "admin");
  assert.equal(resolveUserRole({ role: "superuser" }, []), "free");
});

test("tiers inherit: every free feature is in pro, every pro feature is in admin", () => {
  for (const f of ROLE_PRIVILEGES.free.features) assert.ok(ROLE_PRIVILEGES.pro.features.has(f), f);
  for (const f of ROLE_PRIVILEGES.pro.features) assert.ok(ROLE_PRIVILEGES.admin.features.has(f), f);
  assert.ok(ROLE_PRIVILEGES.pro.features.size > ROLE_PRIVILEGES.free.features.size);
  assert.ok(ROLE_PRIVILEGES.admin.features.size > ROLE_PRIVILEGES.pro.features.size);
});

test("canAccessFeature enforces each area's tier boundaries", () => {
  const matrix = [
    ["workspace.projects", [true, true, true]], ["workspace.versionHistory", [false, true, true]], ["workspace.quotaInspector", [false, false, true]],
    ["github.publicRepo", [true, true, true]], ["github.privateRepos", [false, true, true]], ["github.autoCommitSync", [false, true, true]], ["github.branchSelector", [false, true, true]], ["github.buildTelemetry", [false, false, true]],
    ["ai.generate", [true, true, true]], ["ai.priorityModels", [false, true, true]], ["ai.unrestrictedQuota", [false, false, true]], ["ai.diagnostics", [false, false, true]],
    ["systemDesign.coreBlueprints", [true, true, true]], ["systemDesign.customTrafficProfiles", [false, true, true]], ["systemDesign.reportExport", [false, true, true]], ["systemDesign.blueprintCuration", [false, false, true]],
    ["collab.guests", [true, true, true]], ["collab.unlimitedCollaborators", [false, true, true]], ["collab.persistentLinks", [false, true, true]], ["collab.roomModeration", [false, false, true]],
    ["export.standard", [true, true, true]], ["export.pdf", [false, true, true]], ["export.watermarkFree", [false, true, true]], ["export.rawStateInspector", [false, false, true]],
    ["admin.buildInfo", [false, false, true]],
  ];
  for (const [feature, [free, pro, admin]] of matrix) {
    assert.equal(canAccessFeature("free", feature), free, `free ${feature}`);
    assert.equal(canAccessFeature("pro", feature), pro, `pro ${feature}`);
    assert.equal(canAccessFeature("admin", feature), admin, `admin ${feature}`);
  }
  assert.equal(canAccessFeature("nonsense", "export.pdf"), false, "unknown roles are treated as free");
  assert.equal(canAccessFeature("admin", "does.not.exist"), false);
});

test("limits and plan summaries match the product spec", () => {
  assert.equal(ROLE_PRIVILEGES.free.limits.maxProjects, 3);
  assert.equal(ROLE_PRIVILEGES.free.limits.storageBytes, 50 * 1024 * 1024);
  assert.equal(ROLE_PRIVILEGES.free.limits.maxCollabGuests, 3);
  assert.equal(ROLE_PRIVILEGES.free.limits.githubPublicOnly, true);
  assert.equal(ROLE_PRIVILEGES.pro.limits.storageBytes, 5 * 1024 ** 3);
  assert.equal(ROLE_PRIVILEGES.pro.summary, "Unlimited · 5 GB");
  assert.equal(ROLE_PRIVILEGES.admin.summary, "Unlimited · Debug");
  assert.deepEqual(Object.keys(ROLE_PRIVILEGES.free.areas), ["cloudWorkspace", "githubSync", "ai", "systemDesign", "collab", "exportStudio"]);
});

test("gate returns allowed / reason / upgradeTarget without role checks in the UI", () => {
  assert.deepEqual(evaluatePrivilegeGate("pro", "github.privateRepos"), { allowed: true, reason: "", upgradeTarget: null });
  const denied = evaluatePrivilegeGate("free", "github.privateRepos");
  assert.equal(denied.allowed, false);
  assert.equal(denied.upgradeTarget, USER_ROLES.PRO);
  assert.match(denied.reason, /Pro/);
  const adminOnly = evaluatePrivilegeGate("pro", "admin.buildInfo");
  assert.equal(adminOnly.allowed, false);
  assert.equal(adminOnly.upgradeTarget, null);
  assert.equal(evaluatePrivilegeGate("admin", "nope").allowed, false);
});

test("build metadata resolution order, short hash and dev-local fallback", () => {
  const now = new Date("2026-11-28T00:00:00Z");
  assert.deepEqual(resolveBuildMetadata({}, now), { shortHash: DEV_LOCAL_HASH, fullHash: DEV_LOCAL_HASH, branch: "", builtAt: now.toISOString() });
  const sha = "0123456789abcdef0123456789abcdef01234567";
  assert.equal(resolveBuildMetadata({ VITE_GIT_COMMIT_HASH: sha, CF_PAGES_COMMIT_SHA: "x" }).shortHash, "0123456");
  assert.equal(resolveBuildMetadata({ NEXT_PUBLIC_GIT_COMMIT_HASH: sha, CF_PAGES_COMMIT_SHA: "x" }).fullHash, sha);
  assert.equal(resolveBuildMetadata({ CF_PAGES_COMMIT_SHA: sha, VERCEL_GIT_COMMIT_SHA: "y" }).fullHash, sha);
  assert.equal(resolveBuildMetadata({ VERCEL_GIT_COMMIT_SHA: sha }).fullHash, sha);
  const meta = resolveBuildMetadata({ CF_PAGES_COMMIT_SHA: sha, CF_PAGES_BRANCH: "main", VITE_BUILD_TIMESTAMP: "2026-01-01T00:00:00Z" });
  assert.equal(meta.branch, "main");
  assert.equal(meta.builtAt, "2026-01-01T00:00:00Z");
  assert.equal(resolveBuildMetadata({ VITE_GIT_BRANCH: "feat", CF_PAGES_BRANCH: "main" }).branch, "feat");
  assert.equal(getBuildMetadata().shortHash.length > 0, true);
});

test("profile popover wires role pill, summary, GitHub entitlement and an admin-only build strip above Sign out", () => {
  const control = read("../src/features/auth/AuthenticationControl.jsx");
  assert.match(control, /resolveUserRole\(auth\.user\)/);
  assert.match(control, /<RolePill role=\{accountRole\} \/>/);
  assert.match(control, /ROLE_PRIVILEGES\[accountRole\]\.summary/);
  assert.match(control, /Public repo only/);
  assert.ok(control.indexOf("<AdminBuildStrip") > control.indexOf("auth-github-repository-section"));
  assert.ok(control.indexOf("<AdminBuildStrip") < control.indexOf('"Signing out…"'));

  const identity = read("../src/features/auth/ProfileIdentity.jsx");
  assert.match(identity, /if \(role !== USER_ROLES\.ADMIN\) return null;/);
  assert.match(identity, /build · \{shortHash\}/);
  assert.match(identity, /writeText\(text\)/);
  assert.match(identity, /Copied/);
  assert.match(identity, /copyText\(fullHash\)/);
  assert.ok(identity.indexOf("useEffect") < identity.indexOf("if (role !== USER_ROLES.ADMIN) return null;"), "hooks run before the admin early return");
});

test("vite injects build metadata and the hook exists", () => {
  assert.match(read("../vite.config.js"), /__SKETCHIZI_BUILD__/);
  assert.match(read("../src/hooks/usePrivilegeGate.js"), /evaluatePrivilegeGate\(role, feature\)/);
});
