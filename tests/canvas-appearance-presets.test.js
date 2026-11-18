import test from "node:test";
import assert from "node:assert/strict";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import {
  applyCanvasAppearance,
  applyCanvasDrawingStyle,
  CANVAS_DRAWING_STYLES,
  getCanvasAppearanceBackground,
  getCanvasAppearanceFromBackground,
  getCanvasAppearanceTheme,
  getCanvasDrawingStyleFromRoughness,
  getCanvasDrawingStyleRoughness,
} from "../src/features/navigation/canvasAppearance.js";
import { getCanvasBackground } from "../src/features/navigation/canvasTheme.js";

test("Clean follows the existing Day/Night canvas defaults", () => {
  assert.equal(getCanvasAppearanceBackground("clean", false), getCanvasBackground(false));
  assert.equal(getCanvasAppearanceBackground("clean", true), getCanvasBackground(true));
  assert.equal(getCanvasAppearanceTheme("clean", false), "light");
  assert.equal(getCanvasAppearanceTheme("clean", true), "dark");
});

test("Sketch preserves the current canvas surface and follows the app theme", () => {
  assert.equal(getCanvasAppearanceBackground("sketch", false), getCanvasBackground(false));
  assert.equal(getCanvasAppearanceBackground("sketch", true), getCanvasBackground(true));
  assert.equal(getCanvasAppearanceTheme("sketch", false), "light");
  assert.equal(getCanvasAppearanceTheme("sketch", true), "dark");
});

test("Chalkboard always uses dark canvas rendering independently of app theme", () => {
  const background = getCanvasAppearanceBackground("chalkboard", false);
  assert.equal(background, getCanvasAppearanceBackground("chalkboard", true));
  assert.equal(getCanvasAppearanceFromBackground(background), "chalkboard");
  assert.equal(getCanvasAppearanceTheme("chalkboard", false), "dark");
  assert.equal(getCanvasAppearanceTheme("chalkboard", true), "dark");
});

test("Non-chalkboard surfaces restore independently from drawing roughness", () => {
  assert.equal(getCanvasAppearanceFromBackground("#dce8ef"), "clean");
  assert.equal(getCanvasAppearanceFromBackground(undefined), "clean");
  assert.equal(getCanvasAppearanceFromBackground("#ffffff"), "clean");
});

test("Canvas appearance changes the surface without changing drawing style or existing elements", () => {
  let update;
  const existing = [{ id: "rect", type: "rectangle", roughness: 2 }];
  const api = {
    getAppState: () => ({ viewBackgroundColor: "#ffffff", currentItemRoughness: 1 }),
    getSceneElements: () => existing,
    updateScene: (next) => { update = next; },
  };
  assert.equal(applyCanvasAppearance(api, "chalkboard", false), true);
  assert.deepEqual(update.appState, {
    viewBackgroundColor: getCanvasAppearanceBackground("chalkboard", false),
  });
  assert.equal(update.elements, undefined);
  assert.equal(update.captureUpdate, CaptureUpdateAction.IMMEDIATELY);
});

test("Drawing environment maps Architect, Artist and Cartoonist to Excalidraw roughness", () => {
  assert.deepEqual(CANVAS_DRAWING_STYLES, ["architect", "artist", "cartoonist"]);
  assert.equal(getCanvasDrawingStyleRoughness("architect"), 0);
  assert.equal(getCanvasDrawingStyleRoughness("artist"), 1);
  assert.equal(getCanvasDrawingStyleRoughness("cartoonist"), 2);
  assert.equal(getCanvasDrawingStyleFromRoughness(0), "architect");
  assert.equal(getCanvasDrawingStyleFromRoughness(1), "artist");
  assert.equal(getCanvasDrawingStyleFromRoughness(2), "cartoonist");
  assert.equal(getCanvasDrawingStyleFromRoughness(99), "artist");
});

test("Selecting a drawing environment updates only the defaults for new elements", () => {
  let update;
  const existing = [{ id: "rect", type: "rectangle", roughness: 0 }];
  const api = {
    getAppState: () => ({ currentItemRoughness: 0 }),
    getSceneElements: () => existing,
    updateScene: (next) => { update = next; },
  };
  assert.equal(applyCanvasDrawingStyle(api, "cartoonist"), true);
  assert.deepEqual(update.appState, { currentItemRoughness: 2 });
  assert.equal(update.elements, undefined);
  assert.equal(update.captureUpdate, CaptureUpdateAction.IMMEDIATELY);
  assert.equal(applyCanvasDrawingStyle(api, "cartoonist"), false);
});

test("Invalid drawing environments are rejected", () => {
  const api = { getAppState: () => ({}), updateScene: () => { throw new Error("should not update"); } };
  assert.equal(applyCanvasDrawingStyle(api, "watercolor"), false);
  assert.equal(applyCanvasDrawingStyle(null, "artist"), false);
});
