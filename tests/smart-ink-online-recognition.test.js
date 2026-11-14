import test from "node:test";
import assert from "node:assert/strict";
import { supportsOnlineInk, recognizeOnlineInk } from "../src/features/canvas/smartInkOnlineRecognition.js";

test("local ink recognizer is feature-detected rather than assumed", () => {
  assert.equal(supportsOnlineInk(null, null), false);
  assert.equal(supportsOnlineInk({}, class Stroke {}), false);
});

test("online recognizer receives original absolute stroke points and releases resources", async () => {
  const recorded = { strokes: [], cleared: 0, finished: 0, config: null };
  class FakeStroke {
    constructor() { this.points = []; }
    addPoint(point) { this.points.push(point); }
  }
  const navigatorApi = {
    async createHandwritingRecognizer(config) {
      recorded.config = config;
      return {
        startDrawing(options) {
          assert.equal(options.recognitionType, "text");
          return {
            addStroke(stroke) { recorded.strokes.push(stroke); },
            async getPrediction() { return [{ text: "Hello" }]; },
            clear() { recorded.cleared++; },
          };
        },
        finish() { recorded.finished++; },
      };
    },
  };
  const input = [
    {type:"freedraw",x:100,y:50,points:[[0,0],[10,3],[18,0]]},
    {type:"freedraw",x:125,y:56,points:[[0,0],[5,5]]},
  ];
  const result = await recognizeOnlineInk(input, { navigatorApi, StrokeCtor: FakeStroke });
  assert.deepEqual(result, { text: "Hello", available: true, provider: "online" });
  assert.deepEqual(recorded.config, { languages: ["en"] });
  assert.equal(recorded.strokes.length, 2);
  assert.deepEqual(recorded.strokes[0].points[1], {x:110,y:53});
  assert.equal(recorded.cleared, 1);
  assert.equal(recorded.finished, 1);
});

test("unsupported or rejected browser recognizer gracefully falls back", async () => {
  const result = await recognizeOnlineInk([{type:"freedraw",points:[[0,0]]}], {
    navigatorApi: { async createHandwritingRecognizer() { throw new Error("Unavailable"); } },
    StrokeCtor: class FakeStroke { addPoint() {} },
  });
  assert.deepEqual(result, { text: "", available: false });
});
