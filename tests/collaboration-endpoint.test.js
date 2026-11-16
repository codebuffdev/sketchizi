import test from "node:test";
import assert from "node:assert/strict";
import { resolveCollaborationWebSocketUrl } from "../src/features/collaboration/collaborationEndpoint.js";

const pagesLocation = { protocol: "https:", hostname: "sketchizi.pages.dev", host: "sketchizi.pages.dev" };

test("production deployments fail clearly when the collaboration endpoint is not configured", () => {
  assert.throws(
    () => resolveCollaborationWebSocketUrl("", pagesLocation),
    /Set VITE_COLLAB_WS_URL in Cloudflare Pages.*ending in \/collaboration/
  );
});

test("local development keeps the same-origin WebSocket fallback", () => {
  assert.equal(
    resolveCollaborationWebSocketUrl("", { protocol: "http:", hostname: "localhost", host: "localhost:5173" }),
    "ws://localhost:5173/collaboration"
  );
  assert.equal(
    resolveCollaborationWebSocketUrl(undefined, { protocol: "https:", hostname: "localhost", host: "localhost:4173" }),
    "wss://localhost:4173/collaboration"
  );
});

test("production accepts an explicit secure collaboration endpoint", () => {
  assert.equal(
    resolveCollaborationWebSocketUrl("wss://collab.example.com/collaboration", pagesLocation),
    "wss://collab.example.com/collaboration"
  );
});

test("production rejects an insecure WebSocket endpoint on an HTTPS site", () => {
  assert.throws(
    () => resolveCollaborationWebSocketUrl("ws://collab.example.com/collaboration", pagesLocation),
    /served over HTTPS.*must use wss:\/\//
  );
});

test("endpoint must use the server's exact collaboration WebSocket route", () => {
  assert.throws(
    () => resolveCollaborationWebSocketUrl("wss://collab.example.com/", pagesLocation),
    /must end with the \/collaboration WebSocket path/
  );
});
