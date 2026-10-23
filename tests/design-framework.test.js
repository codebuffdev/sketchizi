import test from "node:test";
import assert from "node:assert/strict";
import { createDesignProfile, readDesignProfile, withDesignProfile } from "../src/features/design/model/designDocument.js";
import { getDesignTemplate, listDesignTemplates, createProfileForTemplate, createTemplateElements } from "../src/features/design/templates/templateRegistry.js";
import { validateDesignTemplate } from "../src/features/design/validation/templateValidator.js";
import { parseDrawing, serializeDrawing } from "../src/fileSystem.js";

test("design profiles normalize values and live in a namespaced extension", () => {
  const profile = createDesignProfile({ name: "  URL shortener  ", domain: "software-architecture", creationMode: "template", templateId: "system-design.general", templateVersion: 1, ruleMode: "strict" });
  assert.equal(profile.name, "URL shortener");
  assert.equal(profile.ruleMode, "strict");
  const extensions = withDesignProfile({ "com.example.keep": { ok: true } }, profile);
  assert.deepEqual(extensions["com.example.keep"], { ok: true });
  assert.deepEqual(readDesignProfile(extensions), profile);
  assert.equal(readDesignProfile({}), null);
});

test("built-in templates have unique IDs and expose template metadata", () => {
  const templates = listDesignTemplates();
  assert.ok(templates.length >= 4);
  assert.equal(new Set(templates.map((template) => template.id)).size, templates.length);
  assert.equal(getDesignTemplate("system-design.general").domain, "software-architecture");
  assert.equal(getDesignTemplate("flow.process-basic").requiredRoles.includes("start"), true);
});

test("AWS three-tier starter includes ordered roles and bound connectors", () => {
  const template = getDesignTemplate("aws.webapp.three-tier");
  assert.equal(template.domain, "cloud-infrastructure");
  assert.equal(template.version, 1);
  const elements = createTemplateElements(template.id);
  const roles = elements
    .filter((element) => element.type !== "text" && element.type !== "arrow")
    .map((element) => element.customData?.design?.role);
  assert.deepEqual(roles, ["client", "load-balancer", "compute", "database"]);
  const arrows = elements.filter((element) => element.type === "arrow");
  assert.equal(arrows.length, 3);
  assert.ok(arrows.every((arrow) => arrow.startBinding?.elementId && arrow.endBinding?.elementId));
  const profile = createProfileForTemplate(template.id, { name: "Production Web App", ruleMode: "guided" });
  assert.equal(profile.templateId, template.id);
  assert.equal(profile.domain, "cloud-infrastructure");
  assert.deepEqual(validateDesignTemplate(elements, profile), []);
});

test("AWS event-driven processing starter has the expected services and bound event path", () => {
  const template = getDesignTemplate("aws.event-driven.processing");
  assert.ok(template);
  assert.equal(template.domain, "cloud-infrastructure");
  assert.equal(template.version, 1);
  const elements = createTemplateElements(template.id);
  const nodes = elements.filter((element) => element.type !== "text" && element.type !== "arrow");
  assert.deepEqual(nodes.map((element) => element.customData?.design?.role), ["eventbridge", "sqs", "lambda", "dynamodb"]);
  const arrows = elements.filter((element) => element.type === "arrow");
  assert.equal(arrows.length, 3);
  const idToRole = new Map(nodes.map((element) => [element.id, element.customData.design.role]));
  assert.deepEqual(arrows.map((arrow) => [idToRole.get(arrow.startBinding?.elementId), idToRole.get(arrow.endBinding?.elementId)]), [
    ["eventbridge", "sqs"], ["sqs", "lambda"], ["lambda", "dynamodb"],
  ]);
  assert.ok(arrows.every((arrow) => arrow.startBinding?.elementId && arrow.endBinding?.elementId));
  const profile = createProfileForTemplate(template.id, { name: "Order Event Pipeline", ruleMode: "guided" });
  assert.deepEqual(validateDesignTemplate(elements, profile), []);
  assert.equal(profile.templateId, template.id);
});

test("system architecture starter scene includes client, service, database, and bound connectors", () => {
  const elements = createTemplateElements("system-design.general");
  const roles = elements.filter((element) => element.type !== "text" && element.type !== "arrow").map((element) => element.customData?.design?.role);
  assert.deepEqual(roles, ["client", "service", "database"]);
  const arrows = elements.filter((element) => element.type === "arrow");
  assert.equal(arrows.length, 2);
  assert.ok(arrows.every((arrow) => arrow.startBinding?.elementId && arrow.endBinding?.elementId));
});

test("process-flow template validates cleanly and reports missing required roles", () => {
  const profile = createDesignProfile({ domain: "process-flow", creationMode: "template", templateId: "flow.process-basic", templateVersion: 1, ruleMode: "strict" });
  const starter = createTemplateElements("flow.process-basic");
  assert.deepEqual(validateDesignTemplate(starter, profile), []);
  const onlyStart = starter.filter((element) => element.customData?.design?.role === "start" || element.customData?.design?.labelFor === "start");
  const diagnostics = validateDesignTemplate(onlyStart, profile);
  assert.ok(diagnostics.some((item) => item.code === "template.required-role" && item.severity === "error"));
});

test("built-in design patterns create valid starter graphs", () => {
  for (const id of ["pattern.layered-architecture", "pattern.event-driven"]) {
    const template = getDesignTemplate(id);
    const profile = createDesignProfile({ name: template.name, domain: template.domain, creationMode: "pattern", templateId: id, templateVersion: template.version, ruleMode: "strict" });
    assert.deepEqual(validateDesignTemplate(createTemplateElements(id), profile), []);
  }
});

test("template validation can infer roles from standalone text inside shapes", () => {
  const elements = [
    { id: "client", type: "rectangle", x: 0, y: 0, width: 100, height: 60 },
    { id: "client-label", type: "text", x: 10, y: 15, width: 80, height: 25, text: "Client" },
    { id: "service", type: "rectangle", x: 200, y: 0, width: 100, height: 60 },
    { id: "service-label", type: "text", x: 210, y: 15, width: 80, height: 25, text: "API Service" },
    { id: "database", type: "rectangle", x: 400, y: 0, width: 100, height: 60 },
    { id: "database-label", type: "text", x: 410, y: 15, width: 80, height: 25, text: "Database" },
  ];
  const profile = createDesignProfile({ templateId: "system-design.general", creationMode: "template", domain: "software-architecture", ruleMode: "strict" });
  const diagnostics = validateDesignTemplate(elements, profile);
  assert.ok(diagnostics.some((item) => item.message.includes("'client'")) === false);
  assert.ok(diagnostics.some((item) => item.message.includes("'service'")) === false);
  assert.ok(diagnostics.some((item) => item.message.includes("'database'")) === false);
});

test("template validation uses warnings in guided mode and errors in strict mode", () => {
  const elements = [];
  const guided = createDesignProfile({ templateId: "system-design.general", creationMode: "template", domain: "software-architecture", ruleMode: "guided" });
  const strict = { ...guided, ruleMode: "strict" };
  assert.ok(validateDesignTemplate(elements, guided).every((item) => item.severity === "warning"));
  assert.ok(validateDesignTemplate(elements, strict).every((item) => item.severity === "error"));
});

test("design profile survives .sketchizi round-trip without changing Excalidraw elements", () => {
  const profile = createDesignProfile({ name: "Architecture", domain: "software-architecture", creationMode: "template", templateId: "system-design.general", templateVersion: 1, ruleMode: "guided" });
  const extensions = withDesignProfile({ "com.example.other": { preserve: 7 } }, profile);
  const elements = createTemplateElements("system-design.general");
  const serialized = serializeDrawing({ format: "sketchizi", elements, appState: {}, files: {}, extensions });
  const parsed = parseDrawing(serialized);
  assert.deepEqual(readDesignProfile(parsed.extensions), profile);
  assert.deepEqual(parsed.extensions["com.example.other"], { preserve: 7 });
  assert.deepEqual(parsed.elements, elements);
});


test("template diagnostics identify prohibited bound relationships and respect rule mode", () => {
  const elements = [
    { id: "client", type: "rectangle", x: 0, y: 0, width: 100, height: 60, customData: { design: { role: "client" } } },
    { id: "database", type: "rectangle", x: 200, y: 0, width: 100, height: 60, customData: { design: { role: "database" } } },
    { id: "bad-edge", type: "arrow", x: 100, y: 20, width: 100, height: 0, startBinding: { elementId: "client" }, endBinding: { elementId: "database" } },
  ];
  const strict = createDesignProfile({ templateId: "system-design.general", creationMode: "template", domain: "software-architecture", ruleMode: "strict" });
  const guided = { ...strict, ruleMode: "guided" };
  const strictFinding = validateDesignTemplate(elements, strict).find((item) => item.code === "template.relationship");
  const guidedFinding = validateDesignTemplate(elements, guided).find((item) => item.code === "template.relationship");
  assert.equal(strictFinding?.elementId, "bad-edge");
  assert.equal(strictFinding?.severity, "error");
  assert.equal(guidedFinding?.severity, "warning");
});


test("strict enforcement rejects only new prohibited connectors and leaves existing connectors alone", async () => {
  const { enforceStrictTemplateRelationships } = await import("../src/features/design/validation/strictTemplateEnforcement.js");
  const profile = createDesignProfile({ templateId: "system-design.general", creationMode: "template", domain: "software-architecture", ruleMode: "strict" });
  const client = { id: "client", type: "rectangle", x: 0, y: 0, width: 100, height: 60, customData: { design: { role: "client" } } };
  const database = { id: "database", type: "rectangle", x: 200, y: 0, width: 100, height: 60, customData: { design: { role: "database" } } };
  const oldEdge = { id: "old-edge", type: "arrow", startBinding: { elementId: "client" }, endBinding: { elementId: "database" } };
  const baseline = [client, database, oldEdge];
  assert.deepEqual(enforceStrictTemplateRelationships(baseline, baseline, profile).rejectedConnectorIds, []);
  const newBadEdge = { id: "new-edge", type: "arrow", startBinding: { elementId: "client" }, endBinding: { elementId: "database" } };
  const result = enforceStrictTemplateRelationships([...baseline, newBadEdge], baseline, profile);
  assert.deepEqual(result.rejectedConnectorIds, ["new-edge"]);
  assert.equal(result.diagnostics[0].severity, "error");
  const noViolation = enforceStrictTemplateRelationships(baseline, baseline, profile);
  assert.deepEqual(noViolation.rejectedConnectorIds, []);
});


test("relationship diagnostics explain allowed alternatives for the source role", () => {
  const profile = createDesignProfile({ templateId: "system-design.general", creationMode: "template", domain: "software-architecture", ruleMode: "guided" });
  const elements = [
    { id: "client", type: "rectangle", x: 0, y: 0, width: 100, height: 60, customData: { design: { role: "client" } } },
    { id: "database", type: "rectangle", x: 200, y: 0, width: 100, height: 60, customData: { design: { role: "database" } } },
    { id: "bad-edge", type: "arrow", startBinding: { elementId: "client" }, endBinding: { elementId: "database" } },
  ];
  const finding = validateDesignTemplate(elements, profile).find((item) => item.code === "template.relationship");
  assert.equal(finding?.sourceRole, "client");
  assert.equal(finding?.targetRole, "database");
  assert.ok(finding?.suggestions?.some((text) => text.includes("service")));
  assert.deepEqual(finding?.allowedRelationships, [
    { from: "client", to: "service" },
    { from: "service", to: "database" },
  ]);
});


test("design recommendations identify missing required roles without mutating elements", async () => {
  const { recommendDesignNextSteps } = await import("../src/features/design/validation/designRecommendations.js");
  const profile = createDesignProfile({ templateId: "system-design.general", creationMode: "template", domain: "software-architecture", ruleMode: "guided" });
  const elements = [
    { id: "client", type: "rectangle", x: 0, y: 0, width: 100, height: 60, customData: { design: { role: "client" } } },
  ];
  const before = structuredClone(elements);
  const diagnostics = validateDesignTemplate(elements, profile);
  const recommendations = recommendDesignNextSteps(elements, profile, diagnostics);
  assert.ok(recommendations.some((item) => item.type === "component" && item.role === "service"));
  assert.ok(recommendations.some((item) => item.type === "component" && item.role === "database"));
  assert.deepEqual(elements, before);
});

test("design recommendations suggest allowed connections only when both roles exist and are not already connected", async () => {
  const { recommendDesignNextSteps } = await import("../src/features/design/validation/designRecommendations.js");
  const profile = createDesignProfile({ templateId: "system-design.general", creationMode: "template", domain: "software-architecture", ruleMode: "guided" });
  const elements = [
    { id: "client", type: "rectangle", x: 0, y: 0, width: 100, height: 60, customData: { design: { role: "client" } } },
    { id: "service", type: "rectangle", x: 200, y: 0, width: 100, height: 60, customData: { design: { role: "service" } } },
    { id: "database", type: "rectangle", x: 400, y: 0, width: 100, height: 60, customData: { design: { role: "database" } } },
    { id: "client-service", type: "arrow", startBinding: { elementId: "client" }, endBinding: { elementId: "service" } },
  ];
  const recommendations = recommendDesignNextSteps(elements, profile, validateDesignTemplate(elements, profile));
  assert.ok(recommendations.some((item) => item.id === "connection:service->database"));
  assert.equal(recommendations.some((item) => item.id === "connection:client->service"), false);
  assert.equal(recommendations.some((item) => item.id === "connection:client->database"), false);
});

test("ERD recommendations preserve duplicate required-role counts", async () => {
  const { recommendDesignNextSteps } = await import("../src/features/design/validation/designRecommendations.js");
  const profile = createDesignProfile({ templateId: "database.erd-basic", creationMode: "template", domain: "database", ruleMode: "guided" });
  const oneEntity = [{ id: "entity-1", type: "rectangle", x: 0, y: 0, width: 100, height: 60, customData: { design: { role: "entity" } } }];
  const recommendations = recommendDesignNextSteps(oneEntity, profile, validateDesignTemplate(oneEntity, profile));
  assert.equal(recommendations.filter((item) => item.type === "component" && item.role === "entity").length, 1);
});


test("exported role inference remains available for user-confirmed recommendation actions", async () => {
  const { inferDesignRole } = await import("../src/features/design/validation/templateValidator.js");
  const element = { id: "api", type: "rectangle", customData: { design: { role: "service" } } };
  assert.equal(inferDesignRole(element, [element]), "service");
});


test("recommendation placement is outside existing visible elements", async () => {
  const { findRecommendationPosition } = await import("../src/features/design/validation/recommendationLayout.js");
  const elements = [
    { id: "a", type: "rectangle", x: 100, y: 100, width: 180, height: 80 },
    { id: "b", type: "rectangle", x: 328, y: 100, width: 180, height: 80 },
    { id: "deleted", type: "rectangle", x: 600, y: 100, width: 180, height: 80, isDeleted: true },
  ];
  const position = findRecommendationPosition(elements, { width: 180, height: 80, gap: 48 });
  assert.ok(position.x >= 556);
  assert.ok(position.y >= 100);
  assert.deepEqual([position.width, position.height], [180, 80]);
  const visibleElements = elements.filter((element) => !element.isDeleted);
  assert.equal(visibleElements.some((element) => position.x < element.x + element.width + 24
    && position.x + position.width + 24 > element.x
    && position.y < element.y + element.height + 24
    && position.y + position.height + 24 > element.y), false);
});

test("recommendation placement uses a stable starting position for an empty canvas", async () => {
  const { findRecommendationPosition } = await import("../src/features/design/validation/recommendationLayout.js");
  assert.deepEqual(findRecommendationPosition([]), { x: 80, y: 80, width: 180, height: 80 });
});

test("connection recommendations expose candidate element IDs for multiple same-role components", async () => {
  const { recommendDesignNextSteps } = await import("../src/features/design/validation/designRecommendations.js");
  const profile = createDesignProfile({ templateId: "system-design.general", creationMode: "template", domain: "software-architecture", ruleMode: "guided" });
  const elements = [
    { id: "client", type: "rectangle", x: 0, y: 0, width: 100, height: 60, customData: { design: { role: "client" } } },
    { id: "service-a", type: "rectangle", x: 200, y: 0, width: 100, height: 60, customData: { design: { role: "service" } } },
    { id: "service-b", type: "rectangle", x: 200, y: 100, width: 100, height: 60, customData: { design: { role: "service" } } },
    { id: "database", type: "rectangle", x: 400, y: 0, width: 100, height: 60, customData: { design: { role: "database" } } },
    { id: "edge-a", type: "arrow", startBinding: { elementId: "service-a" }, endBinding: { elementId: "database" } },
  ];
  const recommendation = recommendDesignNextSteps(elements, profile, validateDesignTemplate(elements, profile)).find((item) => item.id === "connection:service->database");
  assert.deepEqual(recommendation?.sourceElementIds, ["service-a", "service-b"]);
  assert.deepEqual(recommendation?.targetElementIds, ["database"]);
});


test("improvement review prioritizes errors before warnings and recommendations", async () => {
  const { buildDesignImprovementReview } = await import("../src/features/design/validation/designImprovementReview.js");
  const review = buildDesignImprovementReview([
    { code: "template.unbound-connector", severity: "warning", message: "Unbound connector" },
    { code: "template.relationship", severity: "error", message: "Invalid relationship", elementId: "edge-1" },
  ], [
    { id: "component:service", type: "component", title: "Add service", message: "Missing service" },
  ]);
  assert.deepEqual(review.items.map((item) => item.priority), ["high", "medium", "low"]);
  assert.deepEqual(review.counts, { high: 1, medium: 1, low: 1, info: 0 });
  assert.equal(review.total, 3);
});

test("improvement review provides actionable explanations for known template findings", async () => {
  const { buildDesignImprovementReview } = await import("../src/features/design/validation/designImprovementReview.js");
  const review = buildDesignImprovementReview([
    { code: "template.required-role", severity: "error", message: "Add a 'service' component." },
    { code: "template.relationship", severity: "warning", message: "Invalid relationship" },
  ]);
  assert.ok(review.items[0].detail.includes("Required components"));
  assert.ok(review.items[0].nextAction.includes("Add"));
  assert.ok(review.items[1].detail.includes("relationship"));
});

test("improvement review output does not mutate diagnostics or recommendations", async () => {
  const { buildDesignImprovementReview } = await import("../src/features/design/validation/designImprovementReview.js");
  const diagnostics = [{ code: "template.required-role", severity: "error", message: "Missing role" }];
  const recommendations = [{ id: "component:service", type: "component", title: "Add service", message: "Add it" }];
  const before = structuredClone({ diagnostics, recommendations });
  buildDesignImprovementReview(diagnostics, recommendations);
  assert.deepEqual({ diagnostics, recommendations }, before);
});



import { calculateDesignQualityScore } from "../src/features/design/validation/designQualityScore.js";

test("clean design scores 100 and recommendations are advisory only", () => {
  const recommendations = [{ title: "Add a missing relationship" }];
  const result = calculateDesignQualityScore([], recommendations);
  assert.equal(result.score, 100);
  assert.equal(result.label, "Strong");
  assert.equal(result.recommendationsCount, 1);
  assert.equal(result.rules.recommendationsAffectScore, false);
});

test("deducts 15 for each error and 5 for each warning", () => {
  const result = calculateDesignQualityScore([
    { severity: "error", message: "Missing service" },
    { severity: "warning", message: "Unconnected database" },
    { severity: "info", message: "Optional note" },
  ]);
  assert.equal(result.score, 80);
  assert.equal(result.appliedDeduction, 20);
  assert.deepEqual(result.counts, { error: 1, warning: 1, info: 1, other: 0 });
});

test("caps deductions at 60", () => {
  const diagnostics = Array.from({ length: 10 }, (_, i) => ({
    severity: "error",
    message: `Error ${i}`,
  }));
  const result = calculateDesignQualityScore(diagnostics);
  assert.equal(result.score, 40);
  assert.equal(result.appliedDeduction, 60);
  assert.equal(result.uncappedDeduction, 150);
});

test("does not mutate diagnostics or recommendations", () => {
  const diagnostics = [{ severity: "warning", message: "Review me" }];
  const recommendations = [{ title: "Add a component" }];
  const diagnosticsBefore = structuredClone(diagnostics);
  const recommendationsBefore = structuredClone(recommendations);
  calculateDesignQualityScore(diagnostics, recommendations);
  assert.deepEqual(diagnostics, diagnosticsBefore);
  assert.deepEqual(recommendations, recommendationsBefore);
});

test("uses the score bands consistently", () => {
  assert.equal(calculateDesignQualityScore([]).label, "Strong");
  assert.equal(calculateDesignQualityScore([{ severity: "error" }]).label, "Good progress");
  assert.equal(calculateDesignQualityScore(Array.from({ length: 2 }, () => ({ severity: "error" }))).label, "Needs attention");
  assert.equal(calculateDesignQualityScore(Array.from({ length: 4 }, () => ({ severity: "error" }))).label, "Early draft");
  assert.equal(calculateDesignQualityScore(Array.from({ length: 5 }, () => ({ severity: "error" }))).label, "Early draft");
});


import { buildDesignCompletenessReport } from "../src/features/design/validation/designCompletenessReport.js";

test("completeness report lists missing template roles without changing the quality score", () => {
  const template = {
    id: "system-design.general",
    name: "System Design",
    rules: { requiredRoles: ["client", "service", "database"], allowedRelationships: [] },
  };
  const report = buildDesignCompletenessReport(
    template,
    [{ severity: "warning", code: "missing-required-role", message: "Missing required role: database" }],
    [
      { id: "c1", type: "rectangle", text: "client" },
      { id: "s1", type: "rectangle", text: "service" },
    ],
    { ruleMode: "guided" },
  );
  assert.equal(report.status, "incomplete");
  assert.equal(report.summary.completeRoles, 2);
  assert.equal(report.summary.missingRoles, 1);
  assert.equal(report.roles.find((item) => item.role === "database").status, "missing");
  assert.equal(report.roles.find((item) => item.role === "database").severity, "warning");
});

test("completeness report handles duplicate required roles", () => {
  const template = {
    id: "database.erd-basic",
    name: "ERD Basic",
    rules: { requiredRoles: ["entity", "entity"], allowedRelationships: [] },
  };
  const report = buildDesignCompletenessReport(template, [], [
    { id: "e1", type: "rectangle", text: "entity" },
  ], {});
  assert.equal(report.summary.requiredRoles, 1);
  assert.equal(report.summary.completeRoles, 0);
  assert.equal(report.roles[0].requiredCount, 2);
  assert.equal(report.roles[0].presentCount, 1);
});

test("completeness report relationship checks are cautious when roles are absent", () => {
  const template = {
    id: "flow.process-basic",
    name: "Process Flow",
    rules: { requiredRoles: [], allowedRelationships: [{ from: "start", to: "task" }] },
  };
  const report = buildDesignCompletenessReport(template, [], [], {});
  assert.equal(report.relationships[0].status, "not-assessed");
  assert.equal(report.status, "complete");
  assert.match(report.note, /not a guarantee/);
});

test("completeness report does not mutate its inputs", () => {
  const template = { id: "x", name: "X", rules: { requiredRoles: ["client"], allowedRelationships: [] } };
  const diagnostics = [{ severity: "warning", message: "Missing required role: client" }];
  const elements = [{ id: "c1", type: "rectangle", text: "client" }];
  const before = structuredClone({ template, diagnostics, elements });
  buildDesignCompletenessReport(template, diagnostics, elements, {});
  assert.deepEqual({ template, diagnostics, elements }, before);
});


test("completeness report exposes explicit actions for missing roles", () => {
  const template = {
    id: "system-design.general",
    name: "System Design",
    rules: { requiredRoles: ["client", "service", "database"], allowedRelationships: [] },
  };
  const report = buildDesignCompletenessReport(template, [], [
    { id: "c1", type: "rectangle", text: "client" },
    { id: "s1", type: "rectangle", text: "service" },
  ], { ruleMode: "guided" });
  assert.equal(report.actionableRequirements.length, 1);
  assert.equal(report.actionableRequirements[0].role, "database");
  assert.equal(report.actionableRequirements[0].action, "add-component");
});

test("strict mode marks missing roles as errors in the completeness report", () => {
  const report = buildDesignCompletenessReport(
    { id: "t", name: "Template", rules: { requiredRoles: ["service"], allowedRelationships: [] } },
    [],
    [],
    { ruleMode: "strict" },
  );
  assert.equal(report.roles[0].severity, "error");
  assert.equal(report.actionableRequirements[0].severity, "error");
});


test("quality score ignores informational findings and caps deductions predictably", () => {
  const result = calculateDesignQualityScore([
    { severity: "info", message: "Informational only" },
    { severity: "warning", message: "Warning one" },
    { severity: "warning", message: "Warning two" },
    { severity: "error", message: "Error one" },
  ], [{ title: "Advisory recommendation" }]);
  assert.equal(result.score, 75);
  assert.equal(result.appliedDeduction, 25);
  assert.equal(result.recommendationsCount, 1);
});

test("quality score accepts empty and malformed inputs safely", () => {
  assert.equal(calculateDesignQualityScore(null, null).score, 100);
  assert.equal(calculateDesignQualityScore("not an array", {}).score, 100);
});

test("completeness report excludes deleted elements when counting roles", () => {
  const report = buildDesignCompletenessReport(
    { id: "t", name: "Template", rules: { requiredRoles: ["service"], allowedRelationships: [] } },
    [],
    [{ id: "old", type: "rectangle", text: "service", isDeleted: true }],
    { ruleMode: "guided" },
  );
  assert.equal(report.summary.missingRoles, 1);
  assert.equal(report.roles[0].presentCount, 0);
});

test("completeness report marks strict missing-role actions as errors", () => {
  const report = buildDesignCompletenessReport(
    { id: "t", name: "Template", rules: { requiredRoles: ["database"], allowedRelationships: [] } },
    [],
    [],
    { ruleMode: "strict" },
  );
  assert.deepEqual(report.actionableRequirements.map((item) => item.severity), ["error"]);
});

test("completeness report does not claim a relationship was verified when roles are absent", () => {
  const report = buildDesignCompletenessReport(
    { id: "t", name: "Template", rules: { requiredRoles: [], allowedRelationships: [{ from: "client", to: "service" }] } },
    [],
    [],
    {},
  );
  assert.equal(report.relationships[0].status, "not-assessed");
  assert.match(report.relationships[0].explanation, /both roles are present/);
});

test("strict enforcement helper remains conservative about existing connectors", () => {
  const profile = {
    templateId: "flow.process-basic",
    ruleMode: "strict",
  };
  const existing = [
    { id: "start", type: "ellipse", text: "start", customData: { designRole: "start" } },
    { id: "task", type: "rectangle", text: "task", customData: { designRole: "task" } },
    { id: "existing-edge", type: "arrow", startBinding: { elementId: "start" }, endBinding: { elementId: "task" } },
  ];
  const diagnostics = validateDesignTemplate(existing, profile);
  assert.ok(Array.isArray(diagnostics));
  assert.ok(!diagnostics.some((item) => item.code === "existing-connector-rejected"));
});

test("system architecture optional cache configuration creates a bound cache layer and persists its profile option", async () => {
  const { createProfileForTemplate, getTemplateRulesForProfile } = await import("../src/features/design/templates/templateRegistry.js");
  const profile = createProfileForTemplate("system-design.general", { name: "Cached API", ruleMode: "strict", templateOptions: { includeCache: true } });
  const elements = createTemplateElements("system-design.general", { includeCache: true });
  const roles = elements.filter((element) => ["rectangle", "ellipse", "diamond"].includes(element.type)).map((element) => element.customData?.design?.role).filter(Boolean);
  assert.deepEqual(roles, ["client", "service", "cache", "database"]);
  const rules = getTemplateRulesForProfile(getDesignTemplate("system-design.general"), profile);
  assert.deepEqual(rules.requiredRoles, ["client", "service", "database", "cache"]);
  assert.deepEqual(rules.allowedRelationships, [["client", "service"], ["service", "cache"], ["cache", "database"]]);
  assert.deepEqual(validateDesignTemplate(elements, profile), []);
  const extensions = withDesignProfile({}, profile);
  const serialized = serializeDrawing({ format: "sketchizi", elements, appState: {}, files: {}, extensions });
  const parsed = parseDrawing(serialized);
  assert.equal(readDesignProfile(parsed.extensions).templateOptions.includeCache, true);
});

test("system architecture without optional cache retains the default three-tier starter", () => {
  const profile = createDesignProfile({ domain: "software-architecture", creationMode: "template", templateId: "system-design.general" });
  const elements = createTemplateElements("system-design.general");
  const roles = elements.filter((element) => ["rectangle", "ellipse", "diamond"].includes(element.type)).map((element) => element.customData?.design?.role).filter(Boolean);
  assert.deepEqual(roles, ["client", "service", "database"]);
  assert.deepEqual(validateDesignTemplate(elements, profile), []);
});


test("AWS serverless API starter contains API Gateway, Lambda, DynamoDB and bound connectors", () => {
  const template = getDesignTemplate("aws.serverless.api");
  assert.ok(template);
  assert.equal(template.domain, "cloud-infrastructure");
  assert.equal(template.version, 1);
  const elements = createTemplateElements(template.id);
  const roles = elements.filter((element) => element.type !== "text" && element.type !== "arrow").map((element) => element.customData?.design?.role);
  assert.deepEqual(roles, ["api-gateway", "lambda", "dynamodb"]);
  const arrows = elements.filter((element) => element.type === "arrow");
  assert.equal(arrows.length, 2);
  assert.ok(arrows.every((arrow) => arrow.startBinding?.elementId && arrow.endBinding?.elementId));
  const profile = createProfileForTemplate(template.id, { name: "Orders API", ruleMode: "guided" });
  assert.equal(profile.templateId, template.id);
  assert.deepEqual(validateDesignTemplate(elements, profile), []);
});


test("AWS VPC networking starter includes network boundaries and a bound traffic path", () => {
  const template = getDesignTemplate("aws.vpc.networking");
  assert.ok(template);
  assert.equal(template.domain, "cloud-infrastructure");
  assert.equal(template.version, 1);
  const elements = createTemplateElements(template.id);
  const shapes = elements.filter((element) => ["rectangle", "ellipse", "diamond", "polygon", "frame"].includes(element.type));
  const roles = shapes.map((element) => element.customData?.design?.role);
  for (const role of ["vpc-boundary", "public-subnet", "private-subnet", "client", "internet-gateway", "load-balancer", "compute", "database"]) {
    assert.ok(roles.includes(role), `missing role ${role}`);
  }
  const trafficNodes = shapes.filter((element) => ["client", "internet-gateway", "load-balancer", "compute", "database"].includes(element.customData?.design?.role));
  const arrows = elements.filter((element) => element.type === "arrow");
  assert.equal(arrows.length, 4);
  const idToRole = new Map(trafficNodes.map((element) => [element.id, element.customData.design.role]));
  assert.deepEqual(arrows.map((arrow) => [idToRole.get(arrow.startBinding?.elementId), idToRole.get(arrow.endBinding?.elementId)]), [
    ["client", "internet-gateway"], ["internet-gateway", "load-balancer"], ["load-balancer", "compute"], ["compute", "database"],
  ]);
  assert.ok(arrows.every((arrow) => arrow.startBinding?.elementId && arrow.endBinding?.elementId));
  const profile = createProfileForTemplate(template.id, { name: "VPC Network", ruleMode: "guided" });
  assert.deepEqual(validateDesignTemplate(elements, profile), []);
});
