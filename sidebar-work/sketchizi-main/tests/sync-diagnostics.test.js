import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { syncDiagnosticsEnabled as serverDiagnosticsEnabled } from "../server/syncDiagnostics.mjs";

const rootUrl = pathToFileURL(`${process.cwd()}/`).href;

test("server diagnostics are disabled unless explicitly enabled", () => {
  assert.equal(serverDiagnosticsEnabled(), process.env.SKETCHIZI_SYNC_DIAGNOSTICS === "1");
});

test("browser diagnostics activate only with the explicit URL query parameter and omit content", async () => {
  const originalWindow = globalThis.window;
  const originalDebug = console.debug;
  const output = [];
  try {
    globalThis.window = { location: { search: "" } };
    const disabledModule = await import("../src/features/collaboration/syncDiagnostics.js?diagnostics-disabled-test");
    assert.equal(disabledModule.syncDiagnosticsEnabled(), false);

    globalThis.window = { location: { search: "?sketchiziSyncDiagnostics=1" } };
    const enabledModule = await import("../src/features/collaboration/syncDiagnostics.js?diagnostics-enabled-test");
    assert.equal(enabledModule.syncDiagnosticsEnabled(), true);
    console.debug = (...args) => output.push(args.join(" "));
    enabledModule.recordSyncDiagnostic("privacy-test", {
      roomRef: "h1234abcd",
      elementCount: 7,
      message: "DO_NOT_LOG_THIS_PRIVATE_TEXT",
      text: "DO_NOT_LOG_THIS_PRIVATE_TEXT",
      payload: "DO_NOT_LOG_THIS_PRIVATE_TEXT",
      elementTypeCounts: { rectangle: 3, arrow: 4 },
    });
    assert.equal(output.length, 1);
    assert.match(output[0], /privacy-test/);
    assert.match(output[0], /rectangle/);
    assert.doesNotMatch(output[0], /DO_NOT_LOG_THIS_PRIVATE_TEXT/);
  } finally {
    console.debug = originalDebug;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("server diagnostics activate by environment flag and omit supplied private content", () => {
  const script = `
    process.env.SKETCHIZI_SYNC_DIAGNOSTICS = "1";
    const diagnostics = await import(${JSON.stringify(`${rootUrl}server/syncDiagnostics.mjs?enabled-child-test`)});
    let output = "";
    console.info = (...args) => { output += args.join(" "); };
    if (!diagnostics.syncDiagnosticsEnabled()) process.exit(2);
    diagnostics.recordSyncDiagnostic("privacy-test", { roomRef: "room-hash", message: "PRIVATE_TEXT_SENTINEL", text: "PRIVATE_TEXT_SENTINEL", elementCount: 3 });
    if (!output.includes("privacy-test") || output.includes("PRIVATE_TEXT_SENTINEL")) process.exit(3);
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
