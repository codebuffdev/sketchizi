import test from "node:test";
import assert from "node:assert/strict";
import { createDesignProfile, readDesignProfile, withDesignProfile } from "../src/features/design/model/designDocument.js";
import { getDesignTemplate, listDesignTemplates, createTemplateElements } from "../src/features/design/templates/templateRegistry.js";
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
