import test from "node:test";
import assert from "node:assert/strict";
import { BUILT_IN_TEMPLATES, createTemplateElements, getDesignTemplate } from "../src/features/design/templates/templateRegistry.js";
import { categoryForTemplate, filterDesignTemplates, previewLayoutForTemplate } from "../src/features/design/templates/templateCatalog.js";

const ids = [
  "system-design.scalable-webapp",
  "system-design.url-shortener",
  "system-design.media-processing",
  "system-design.microservices",
];

test("new system design templates are discoverable in the System design category", () => {
  const templates = filterDesignTemplates(BUILT_IN_TEMPLATES, { category: "system" });
  for (const id of ids) {
    assert.ok(getDesignTemplate(id), `${id} is registered`);
    assert.ok(templates.some((template) => template.id === id), `${id} is discoverable`);
    assert.equal(categoryForTemplate(getDesignTemplate(id)), "system");
  }
});

test("new system design templates are searchable by name and domain", () => {
  assert.ok(filterDesignTemplates(BUILT_IN_TEMPLATES, { query: "url shortener" }).some((template) => template.id === "system-design.url-shortener"));
  assert.ok(filterDesignTemplates(BUILT_IN_TEMPLATES, { query: "asynchronous media" }).some((template) => template.id === "system-design.media-processing"));
  assert.ok(filterDesignTemplates(BUILT_IN_TEMPLATES, { query: "software-architecture" }).some((template) => template.id === "system-design.microservices"));
});

test("each new system design template creates bound Excalidraw shapes, labels, and relationships", () => {
  for (const id of ids) {
    const elements = createTemplateElements(id);
    assert.ok(elements.length >= 12, `${id} creates a meaningful diagram`);
    const shapes = elements.filter((element) => element.type === "rectangle");
    const labels = elements.filter((element) => element.type === "text");
    const arrows = elements.filter((element) => element.type === "arrow");
    assert.ok(shapes.length >= 5, `${id} includes multiple components`);
    assert.equal(labels.length, shapes.length, `${id} labels every component`);
    assert.ok(arrows.length >= 4, `${id} has connected relationships`);
    for (const arrow of arrows) {
      assert.ok(arrow.startBinding?.elementId);
      assert.ok(arrow.endBinding?.elementId);
    }
  }
});

test("system design template cards expose purpose-built preview node summaries", () => {
  assert.ok(previewLayoutForTemplate(getDesignTemplate(ids[0])).nodes.includes("CDN"));
  assert.ok(previewLayoutForTemplate(getDesignTemplate(ids[1])).nodes.includes("URL Store"));
  assert.ok(previewLayoutForTemplate(getDesignTemplate(ids[2])).nodes.includes("Workers"));
  assert.ok(previewLayoutForTemplate(getDesignTemplate(ids[3])).nodes.includes("API Gateway"));
});
