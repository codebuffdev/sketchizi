import test from "node:test";
import assert from "node:assert/strict";
import { findGrammarIssues } from "../src/features/canvas/grammarSuggestions.js";

test("suggests common spelling and grammar corrections without changing input", () => {
  const original = "teh system has a apple and i recieve data";
  const issues = findGrammarIssues(original);
  assert.ok(issues.some((issue) => issue.original.toLowerCase() === "teh" && issue.suggestion === "the"));
  assert.ok(issues.some((issue) => issue.original === "a apple" && issue.suggestion === "an apple"));
  assert.ok(issues.some((issue) => issue.original === "i" && issue.suggestion === "I"));
  assert.equal(original, "teh system has a apple and i recieve data");
});

test("suggests punctuation, capitalization, and whitespace improvements", () => {
  const issues = findGrammarIssues("this is a simple sentence  with extra space");
  assert.ok(issues.some((issue) => issue.suggestion === " "));
  assert.ok(issues.some((issue) => issue.suggestion === "."));
  assert.ok(issues.some((issue) => issue.start === 0 && issue.suggestion === "T"));
});
