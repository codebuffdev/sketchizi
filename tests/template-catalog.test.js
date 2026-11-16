import test from "node:test";
import assert from "node:assert/strict";
import { listDesignTemplates, createProfileForTemplate, createTemplateElements } from "../src/features/design/templates/templateRegistry.js";
import { categoryForTemplate, filterDesignTemplates, previewLayoutForTemplate } from "../src/features/design/templates/templateCatalog.js";
import { parseDrawing, serializeDrawing } from "../src/fileSystem.js";

const templates = listDesignTemplates();

test("template catalog categorizes built-in patterns and data designs consistently", () => {
  assert.equal(categoryForTemplate(templates.find((item) => item.id === "pattern.layered-architecture")), "patterns");
  assert.equal(categoryForTemplate(templates.find((item) => item.id === "flow.process-basic")), "flows");
  assert.equal(categoryForTemplate(templates.find((item) => item.id === "database.erd-basic")), "flows");
  assert.equal(categoryForTemplate(templates.find((item) => item.id === "system-design.general")), "system");
  assert.equal(categoryForTemplate({ id: "aws.example", domain: "cloud-infrastructure" }), "aws");
});

test("catalog filtering applies category and search together and excludes blank canvas", () => {
  const results = filterDesignTemplates(templates, { category: "patterns", query: "event" });
  assert.deepEqual(results.map((item) => item.id), ["pattern.event-driven"]);
  assert.equal(filterDesignTemplates(templates, { category: "flows", query: "not-a-template" }).length, 0);
  assert.equal(filterDesignTemplates(templates, { category: "all" }).some((item) => item.creationMode === "blank"), false);
});

test("template previews use a layout appropriate to each built-in starter", () => {
  const byId = (id) => previewLayoutForTemplate(templates.find((item) => item.id === id));
  assert.equal(byId("system-design.general").kind, "system");
  assert.deepEqual(byId("aws.webapp.three-tier"), { kind: "cloud", nodes: ["Clients", "Load Balancer", "EC2", "RDS"] });
  assert.deepEqual(byId("aws.serverless.api"), { kind: "cloud", nodes: ["API Gateway", "Lambda", "DynamoDB"] });
  assert.deepEqual(byId("aws.event-driven.processing"), { kind: "event-cloud", nodes: ["EventBridge", "SQS", "Lambda", "DynamoDB"] });
  assert.deepEqual(byId("pattern.layered-architecture").nodes, ["Presentation", "Application", "Domain", "Infrastructure"]);
  assert.equal(byId("pattern.event-driven").kind, "event");
  assert.equal(byId("database.erd-basic").kind, "data");
  assert.equal(previewLayoutForTemplate({ id: "aws.webapp", domain: "cloud-infrastructure" }).kind, "cloud");
});

test("each non-blank built-in template creates a profile and serializable starter scene", () => {
  for (const template of templates.filter((item) => item.creationMode !== "blank")) {
    const profile = createProfileForTemplate(template.id, { name: template.name, ruleMode: "guided" });
    const elements = createTemplateElements(template.id);
    assert.equal(profile.templateId, template.id);
    assert.ok(elements.length > 0, `${template.id} should create starter elements`);
    assert.equal(new Set(elements.map((element) => element.id)).size, elements.length, `${template.id} should create unique element IDs`);
    const serialized = serializeDrawing({ format: "sketchizi", elements, appState: {}, files: {}, extensions: { "com.sketchizi.design-profile": profile } });
    const parsed = parseDrawing(serialized);
    assert.equal(parsed.elements.length, elements.length, `${template.id} should round-trip its elements`);
    assert.equal(parsed.extensions?.["com.sketchizi.design-profile"]?.templateId, template.id, `${template.id} should round-trip profile metadata`);
  }
});
