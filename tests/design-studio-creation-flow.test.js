import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createProfileForTemplate, createTemplateElements, getDesignTemplate } from "../src/features/design/templates/templateRegistry.js";
import { readDesignProfile, withDesignProfile } from "../src/features/design/model/designDocument.js";
import { parseDrawing, serializeDrawing } from "../src/fileSystem.js";

const appSource = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
const screenSource = await readFile(new URL("../src/features/design/ui/CreateDesignScreen.jsx", import.meta.url), "utf8");

test("creation screen hands template identity, configuration, and options into the app creation callback", () => {
  assert.match(screenSource, /onCreate\(\{/);
  assert.match(screenSource, /templateId: selectedTemplate\.id/);
  assert.match(screenSource, /ruleMode: configure \? ruleMode/);
  assert.match(screenSource, /region: configure && selectedTemplate\.domain === "cloud-infrastructure" \? awsRegion/);
  assert.match(screenSource, /environment: configure && selectedTemplate\.domain === "cloud-infrastructure" \? environment/);
  assert.match(appSource, /createProfileForTemplate\(templateId, \{ name, ruleMode, templateOptions \}\)/);
  assert.match(appSource, /createTemplateElements\(templateId, templateOptions\)/);
});

test("AWS template configuration is normalized and survives a Sketchizi save/reload round trip", () => {
  const template = getDesignTemplate("aws.serverless.api");
  assert.ok(template);
  const profile = createProfileForTemplate(template.id, {
    name: "Payments API",
    ruleMode: "strict",
    templateOptions: { region: " ap-south-1 ", environment: " production ", ignored: "not persisted" },
  });
  assert.deepEqual(profile.templateOptions, { includeCache: false, region: "ap-south-1", environment: "production" });
  const elements = createTemplateElements(template.id);
  const serialized = serializeDrawing({ format: "sketchizi", elements, appState: {}, files: {}, extensions: withDesignProfile({}, profile) });
  const restored = parseDrawing(serialized);
  assert.deepEqual(readDesignProfile(restored.extensions), profile);
  assert.equal(restored.elements.length, elements.length);
});

test("blank-canvas creation remains a distinct empty design with persisted profile metadata", () => {
  const profile = createProfileForTemplate("general.blank", { name: "My blank canvas", ruleMode: "guided" });
  const elements = createTemplateElements("general.blank");
  assert.deepEqual(elements, []);
  assert.equal(profile.creationMode, "blank");
  assert.equal(profile.templateId, "general.blank");
  const restored = parseDrawing(serializeDrawing({ format: "sketchizi", elements, appState: {}, files: {}, extensions: withDesignProfile({}, profile) }));
  assert.equal(readDesignProfile(restored.extensions)?.name, "My blank canvas");
  assert.deepEqual(restored.elements, []);
});

test("all AWS starters create connected elements and can share the configured profile metadata contract", () => {
  for (const templateId of ["aws.webapp.three-tier", "aws.serverless.api", "aws.event-driven.processing", "aws.vpc.networking"]) {
    const elements = createTemplateElements(templateId);
    assert.ok(elements.length > 0, `${templateId} should produce a scene`);
    assert.ok(elements.some((element) => element.type === "arrow"), `${templateId} should contain relationships`);
    const profile = createProfileForTemplate(templateId, { templateOptions: { region: "eu-west-1", environment: "staging" } });
    assert.equal(profile.templateOptions.region, "eu-west-1");
    assert.equal(profile.templateOptions.environment, "staging");
  }
});
