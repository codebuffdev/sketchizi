import test from "node:test";
import assert from "node:assert/strict";
import { canReorderSelection, getContextualDockModel, reorderElementsBySelection } from "../src/features/canvas/contextualDockModel.js";

test("empty selection shows tools without formatting controls", () => {
  assert.deepEqual(getContextualDockModel([]), {
    mode: "tools",
    selectedCount: 0,
    canEdit: true,
    showToolControls: true,
    showFormatting: false,
    showTextControls: false,
    showShapeControls: false,
    showConnectorControls: false,
    showStrokeControls: false,
    showLayerControls: false,
    showSpecializedProperties: false,
    preserveImageArtwork: false,
  });
});

test("text selection enables text controls only", () => {
  const model = getContextualDockModel([{ id: "t1", type: "text" }]);
  assert.equal(model.mode, "text");
  assert.equal(model.showTextControls, true);
  assert.equal(model.showShapeControls, false);
  assert.equal(model.showConnectorControls, false);
  assert.equal(model.showLayerControls, true);
});

test("shape selection enables shape controls", () => {
  const model = getContextualDockModel([{ id: "s1", type: "rectangle" }]);
  assert.equal(model.mode, "shape");
  assert.equal(model.showShapeControls, true);
  assert.equal(model.showTextControls, false);
});

test("connector selection enables connector controls", () => {
  const model = getContextualDockModel([{ id: "c1", type: "arrow" }]);
  assert.equal(model.mode, "connector");
  assert.equal(model.showConnectorControls, true);
  assert.equal(model.showShapeControls, false);
});

test("mixed selection exposes common formatting but not type-specific controls", () => {
  const model = getContextualDockModel([
    { id: "t1", type: "text" },
    { id: "s1", type: "rectangle" },
  ]);
  assert.equal(model.mode, "mixed-selection");
  assert.equal(model.showFormatting, true);
  assert.equal(model.showTextControls, false);
  assert.equal(model.showShapeControls, false);
  assert.equal(model.showConnectorControls, false);
  assert.equal(model.showStrokeControls, false);
});

test("library image selection preserves original artwork", () => {
  const model = getContextualDockModel([{
    id: "i1",
    type: "image",
    customData: { iconId: "aws-lambda" },
  }]);
  assert.equal(model.mode, "library-image");
  assert.equal(model.preserveImageArtwork, true);
});

test("deleted and null elements are excluded from the selection model", () => {
  const model = getContextualDockModel([
    null,
    { id: "gone", type: "text", isDeleted: true },
    { id: "live", type: "rectangle" },
  ]);
  assert.equal(model.selectedCount, 1);
  assert.equal(model.mode, "shape");
});

test("read-only mode never exposes editing controls", () => {
  const model = getContextualDockModel(
    [{ id: "s1", type: "rectangle" }],
    { canEdit: false },
  );
  assert.equal(model.mode, "read-only");
  assert.equal(model.canEdit, false);
  assert.equal(model.showToolControls, true);
  assert.equal(model.showFormatting, false);
  assert.equal(model.showLayerControls, false);
  assert.equal(model.showSpecializedProperties, true);
});


test("mixed shape and connector selection exposes only shared stroke controls", () => {
  const model = getContextualDockModel([
    { id: "s1", type: "rectangle" },
    { id: "c1", type: "arrow" },
  ]);
  assert.equal(model.mode, "mixed-selection");
  assert.equal(model.showStrokeControls, true);
  assert.equal(model.showShapeControls, false);
  assert.equal(model.showConnectorControls, false);
});

test("mixed selection containing text does not expose shape stroke controls", () => {
  const model = getContextualDockModel([
    { id: "t1", type: "text" },
    { id: "s1", type: "rectangle" },
  ]);
  assert.equal(model.mode, "mixed-selection");
  assert.equal(model.showStrokeControls, false);
  assert.equal(model.showShapeControls, false);
  assert.equal(model.showTextControls, false);
});

test("read-only and empty selections never expose shared stroke controls", () => {
  assert.equal(getContextualDockModel([]).showStrokeControls, false);
  assert.equal(getContextualDockModel([{ type: "arrow" }], { canEdit: false }).showStrokeControls, false);
});

test("layer ordering moves selected elements together and preserves relative order", () => {
  const elements = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const selected = new Set(["b", "d"]);
  assert.deepEqual(
    reorderElementsBySelection(elements, selected, "front").map((element) => element.id),
    ["a", "c", "b", "d"],
  );
  assert.deepEqual(
    reorderElementsBySelection(elements, selected, "back").map((element) => element.id),
    ["b", "d", "a", "c"],
  );
});

test("layer ordering leaves the scene unchanged when no selected ids match", () => {
  const elements = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(reorderElementsBySelection(elements, new Set(["missing"]), "front"), elements);
});

test("layer actions are disabled when selected elements are already at a scene boundary", () => {
  const elements = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.equal(canReorderSelection(elements, new Set(["c"]), "front"), false);
  assert.equal(canReorderSelection(elements, new Set(["a"]), "back"), false);
  assert.equal(canReorderSelection(elements, new Set(["b"]), "front"), true);
  assert.equal(canReorderSelection(elements, new Set(["b"]), "back"), true);
});

test("layer boundary checks ignore deleted elements", () => {
  const elements = [{ id: "deleted", isDeleted: true }, { id: "a" }];
  assert.equal(canReorderSelection(elements, new Set(["a"]), "back"), false);
});
