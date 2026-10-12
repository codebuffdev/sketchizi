import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FONT_FAMILY_ID,
  detectFontFamilyPreferenceChange,
  getTextFontFamilyMap,
  normalizeFontFamilyId,
} from "../src/features/canvas/fontFamilyDefaults.js";

const text = (id, fontFamily, extra = {}) => ({
  id, type: "text", fontFamily, text: id, isDeleted: false, ...extra,
});

test("supported font-family IDs are accepted and invalid IDs are ignored", () => {
  for (const id of [1, 2, 3, 5, 6, 7, 8, 9]) assert.equal(normalizeFontFamilyId(id), id);
  for (const value of [undefined, null, "8", 4, 10, -1, 8.5, NaN]) assert.equal(normalizeFontFamilyId(value), null);
  assert.equal(DEFAULT_FONT_FAMILY_ID, 5);
});

test("font picker preference is captured while the popup remains open", () => {
  assert.equal(detectFontFamilyPreferenceChange({
    previousAppState: { openPopup: "fontFamily", currentItemFontFamily: 5 },
    appState: { openPopup: "fontFamily", currentItemFontFamily: 8 },
  }), 8);
});

test("font picker preference is captured when the popup closes and family changes", () => {
  assert.equal(detectFontFamilyPreferenceChange({
    previousAppState: { openPopup: "fontFamily", currentItemFontFamily: 5 },
    appState: { openPopup: null, currentItemFontFamily: 8 },
  }), 8);
});

test("changing a selected text element font is a fallback when appState did not report the pick", () => {
  const previous = getTextFontFamilyMap([text("a", 5)]);
  assert.equal(detectFontFamilyPreferenceChange({
    previousAppState: { openPopup: null, currentItemFontFamily: 5 },
    appState: { openPopup: null, currentItemFontFamily: 5, selectedElementIds: { a: true } },
    previousTextFontFamilies: previous,
    elements: [text("a", 8)],
  }), 8);
});

test("merely selecting text does not change the default", () => {
  const previous = getTextFontFamilyMap([text("a", 5), text("b", 8)]);
  assert.equal(detectFontFamilyPreferenceChange({
    previousAppState: { openPopup: null, currentItemFontFamily: 5 },
    appState: { openPopup: null, currentItemFontFamily: 5, selectedElementIds: { b: true } },
    previousTextFontFamilies: previous,
    elements: [text("a", 5), text("b", 8)],
  }), null);
});

test("uniform multi-selection font changes update the default; mixed changes are ignored", () => {
  const previous = getTextFontFamilyMap([text("a", 5), text("b", 5)]);
  const state = { openPopup: null, currentItemFontFamily: 5, selectedElementIds: { a: true, b: true } };
  assert.equal(detectFontFamilyPreferenceChange({ previousAppState: state, appState: state, previousTextFontFamilies: previous, elements: [text("a", 8), text("b", 8)] }), 8);
  assert.equal(detectFontFamilyPreferenceChange({ previousAppState: state, appState: state, previousTextFontFamilies: previous, elements: [text("a", 8), text("b", 7)] }), null);
});

test("remote edits do not replace the local default font preference", () => {
  const previous = getTextFontFamilyMap([text("a", 5)]);
  assert.equal(detectFontFamilyPreferenceChange({
    previousAppState: { openPopup: null, currentItemFontFamily: 5 },
    appState: { openPopup: null, currentItemFontFamily: 5, selectedElementIds: { a: true } },
    previousTextFontFamilies: previous, elements: [text("a", 8)], ignoreElementChanges: true,
  }), null);
});
