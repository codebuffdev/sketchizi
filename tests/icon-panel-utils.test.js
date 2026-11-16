import test from "node:test";
import assert from "node:assert/strict";
import {
  getActiveCollectionTitle,
  getHighlightSegments,
  getSubcategoryOptions,
  iconMetaLine,
  mixAllIcons,
  rankIconSearchResults,
  resolveDisplayedIcons,
  scoreIconSearchMatch,
  sourceLabel,
} from "../src/features/icon-library/iconPanelUtils.js";

test("sourceLabel maps catalog sources and categories accurately", () => {
  assert.equal(sourceLabel({ source: "aws" }), "AWS Architecture");
  assert.equal(sourceLabel({ source: "kubernetes" }), "Kubernetes");
  assert.equal(sourceLabel({ source: "networking" }), "Networking");
  assert.equal(sourceLabel({ category: "Mind Maps" }), "Mind Maps");
  assert.equal(sourceLabel({ category: "UML Diagrams" }), "UML");
  assert.equal(sourceLabel({ subtitle: "Eraser" }), "Essentials");
});

test("iconMetaLine formats source and subcategory with clean separator", () => {
  assert.equal(iconMetaLine({ source: "aws", category: "Compute" }), "AWS Architecture · Compute");
  assert.equal(iconMetaLine({ source: "kubernetes", category: "Workloads" }), "Kubernetes · Workloads");
  assert.equal(iconMetaLine({ source: "uml", category: "UML Diagrams" }), "UML");
});

test("scoreIconSearchMatch ranks exact name above prefix and alias matches", () => {
  const exact = { id: "pod", name: "Pod", source: "kubernetes" };
  const prefix = { id: "pod-policy", name: "PodSecurityPolicy", source: "kubernetes" };
  const alias = { id: "ec2", name: "Amazon EC2", searchAliases: ["pod"], source: "aws" };

  assert.ok(scoreIconSearchMatch(exact, "pod") > scoreIconSearchMatch(prefix, "pod"));
  assert.ok(scoreIconSearchMatch(alias, "pod") > scoreIconSearchMatch(prefix, "pod"));

  const ranked = rankIconSearchResults([prefix, alias, exact], "pod");
  assert.deepEqual(
    ranked.map((item) => item.id),
    ["pod", "ec2", "pod-policy"],
  );
});

test("getHighlightSegments splits text around case-insensitive search matches", () => {
  assert.deepEqual(getHighlightSegments("AWS Clean Rooms", "clean"), [
    { text: "AWS ", match: false },
    { text: "Clean", match: true },
    { text: " Rooms", match: false },
  ]);
  assert.deepEqual(getHighlightSegments("Lambda", ""), [{ text: "Lambda", match: false }]);
});

test("mixAllIcons interleaves sources and deduplicates entries", () => {
  const a = [
    { id: "1", name: "One", source: "aws", src: "/1.svg" },
    { id: "2", name: "Two", source: "aws", src: "/2.svg" },
  ];
  const b = [
    { id: "1", name: "One", source: "aws", src: "/1.svg" },
    { id: "k1", name: "Pod", source: "kubernetes", src: "/pod.svg" },
  ];
  const mixed = mixAllIcons([a, b]);
  assert.deepEqual(
    mixed.map((icon) => icon.id),
    ["1", "2", "k1"],
  );
});

test("resolveDisplayedIcons filters favorites, recent, aws subcategories, and search queries", () => {
  const awsIcons = [
    { id: "lambda", name: "AWS Lambda", category: "Compute", source: "aws", src: "/l.svg" },
    { id: "s3", name: "Amazon S3", category: "Storage", source: "aws", src: "/s3.svg" },
  ];
  const favorites = [awsIcons[1]];
  const recentIcons = [awsIcons[0]];

  assert.equal(
    resolveDisplayedIcons({
      activeSource: "aws",
      activeAwsCategory: "Compute",
      awsIcons,
      search: "",
    }).length,
    1,
  );
  assert.equal(
    resolveDisplayedIcons({
      activeSource: "favorites",
      favorites,
      search: "s3",
    })[0].id,
    "s3",
  );
  assert.equal(
    resolveDisplayedIcons({
      activeSource: "recent",
      recentIcons,
      search: "lambda",
    })[0].id,
    "lambda",
  );
  assert.equal(
    resolveDisplayedIcons({
      activeSource: "favorites",
      favorites,
      search: "lambda",
    }).length,
    0,
  );
});

test("getSubcategoryOptions and getActiveCollectionTitle return expected values", () => {
  const awsOptions = getSubcategoryOptions({
    activeSource: "aws",
    awsCategories: ["Compute", "Storage"],
    awsCategoryCounts: { Compute: 28, Storage: 14 },
  });
  assert.deepEqual(awsOptions, [
    { value: "Compute", label: "Compute", count: 28 },
    { value: "Storage", label: "Storage", count: 14 },
  ]);
  assert.equal(getSubcategoryOptions({ activeSource: "uml" }).length, 0);
  assert.equal(getActiveCollectionTitle("favorites"), "Saved Icons");
  assert.equal(getActiveCollectionTitle("kubernetes"), "Kubernetes");
});
