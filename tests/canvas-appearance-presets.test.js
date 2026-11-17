import test from "node:test";
import assert from "node:assert/strict";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import {
  applyCanvasAppearance,
  getCanvasAppearanceBackground,
  getCanvasAppearanceFromBackground,
  getCanvasAppearanceRoughness,
  getCanvasAppearanceTheme,
} from "../src/features/navigation/canvasAppearance.js";
import { getCanvasBackground } from "../src/features/navigation/canvasTheme.js";

test("Clean follows the existing Day/Night canvas defaults", () => {
  assert.equal(getCanvasAppearanceBackground("clean", false), getCanvasBackground(false));
  assert.equal(getCanvasAppearanceBackground("clean", true), getCanvasBackground(true));
  assert.equal(getCanvasAppearanceTheme("clean", false), "light");
  assert.equal(getCanvasAppearanceTheme("clean", true), "dark");
  assert.equal(getCanvasAppearanceRoughness("clean"), 0);
});

test("Sketch preserves the current canvas surface and follows the app theme", () => {
  const day = getCanvasAppearanceBackground("sketch", false);
  const night = getCanvasAppearanceBackground("sketch", true);
  assert.equal(day, getCanvasBackground(false));
  assert.equal(night, getCanvasBackground(true));
  assert.equal(getCanvasAppearanceFromBackground(day, 2), "sketch");
  assert.equal(getCanvasAppearanceFromBackground(night, 2), "sketch");
  assert.equal(getCanvasAppearanceTheme("sketch", false), "light");
  assert.equal(getCanvasAppearanceTheme("sketch", true), "dark");
  assert.equal(getCanvasAppearanceRoughness("sketch"), 2);
});

test("Chalkboard always uses dark canvas rendering independently of app theme", () => {
  const background = getCanvasAppearanceBackground("chalkboard", false);
  assert.equal(background, getCanvasAppearanceBackground("chalkboard", true));
  assert.equal(getCanvasAppearanceFromBackground(background), "chalkboard");
  assert.equal(getCanvasAppearanceTheme("chalkboard", false), "dark");
  assert.equal(getCanvasAppearanceTheme("chalkboard", true), "dark");
  assert.equal(getCanvasAppearanceRoughness("chalkboard"), 2);
});

test("unknown custom backgrounds restore as Clean", () => {
  assert.equal(getCanvasAppearanceFromBackground("#dce8ef"), "clean");
  assert.equal(getCanvasAppearanceFromBackground(undefined), "clean");
});

test("Chalkboard updates its surface and new-element roughness", () => {
  let update;
  const api = {
    getAppState: () => ({ viewBackgroundColor: "#ffffff", currentItemRoughness: 1 }),
    updateScene: (next) => { update = next; },
  };
  assert.equal(applyCanvasAppearance(api, "chalkboard", false), true);
  assert.equal(update.appState.viewBackgroundColor, getCanvasAppearanceBackground("chalkboard", false));
  assert.equal(update.appState.currentItemRoughness, 2);
  assert.equal(update.captureUpdate, CaptureUpdateAction.IMMEDIATELY);
  assert.deepEqual(Object.keys(update.appState).sort(), ["currentItemRoughness", "viewBackgroundColor"]);
});

test("applying Sketch changes roughness without changing the canvas background", () => {
  let update;
  const api = {
    getAppState: () => ({ viewBackgroundColor: "#dce8ef", currentItemRoughness: 1 }),
    updateScene: (next) => { update = next; },
  };
  assert.equal(applyCanvasAppearance(api, "sketch", false), true);
  assert.deepEqual(update.appState, { currentItemRoughness: 2 });
  assert.equal(update.appState.viewBackgroundColor, undefined);
});


test("Sketch applies hand-drawn roughness to existing shapes and lines", () => {
  let update;
  const existing = [
    { id: "rect", type: "rectangle", roughness: 0, version: 3, versionNonce: 10 },
    { id: "line", type: "line", roughness: 0, version: 4, versionNonce: 11 },
    { id: "free", type: "freedraw", roughness: 1, version: 2, versionNonce: 12 },
    { id: "text", type: "text", version: 1, versionNonce: 13 },
    { id: "image", type: "image", version: 1, versionNonce: 14 },
    { id: "deleted", type: "ellipse", roughness: 0, isDeleted: true, version: 1, versionNonce: 15 },
  ];
  const api = {
    getAppState: () => ({ viewBackgroundColor: "#dce8ef", currentItemRoughness: 1 }),
    getSceneElementsIncludingDeleted: () => existing,
    updateScene: (next) => { update = next; },
  };

  assert.equal(applyCanvasAppearance(api, "sketch", false), true);
  assert.deepEqual(update.elements.map(({ id, roughness, version, versionNonce }) => ({
    id, roughness, version, versionNonce,
  })), [
    { id: "rect", roughness: 2, version: 4, versionNonce: 11 },
    { id: "line", roughness: 2, version: 5, versionNonce: 12 },
    { id: "free", roughness: 2, version: 3, versionNonce: 13 },
    { id: "text", roughness: undefined, version: 1, versionNonce: 13 },
    { id: "image", roughness: undefined, version: 1, versionNonce: 14 },
    { id: "deleted", roughness: 0, version: 1, versionNonce: 15 },
  ]);
  assert.equal(update.appState.currentItemRoughness, 2);
});

test("Clean removes hand-drawn roughness from existing shapes and lines", () => {
  let update;
  const existing = [
    { id: "rect", type: "rectangle", roughness: 2, version: 3, versionNonce: 10 },
    { id: "arrow", type: "arrow", roughness: 2, version: 4, versionNonce: 11 },
  ];
  const api = {
    getAppState: () => ({ viewBackgroundColor: "#dce8ef", currentItemRoughness: 2 }),
    getSceneElements: () => existing,
    updateScene: (next) => { update = next; },
  };

  assert.equal(applyCanvasAppearance(api, "clean", false), true);
  assert.deepEqual(update.elements.map(({ roughness, version, versionNonce }) => ({
    roughness, version, versionNonce,
  })), [
    { roughness: 0, version: 4, versionNonce: 11 },
    { roughness: 0, version: 5, versionNonce: 12 },
  ]);
  assert.equal(update.appState.currentItemRoughness, 0);
});
