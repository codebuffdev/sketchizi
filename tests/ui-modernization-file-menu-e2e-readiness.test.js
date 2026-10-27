import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const menu = readFileSync(new URL("../src/features/navigation/useNativeSketchiziMenu.js", import.meta.url), "utf8");

test("file menu announces opening operations and marks controls busy", () => {
  assert.match(menu, /data-file-menu-announcement/);
  assert.match(menu, /button\.setAttribute\("aria-busy", "true"\)/);
  assert.match(menu, /announceFileMenuStatus\(\x60Opening \$\{label\}…\x60\)/);
  assert.match(menu, /button\.removeAttribute\("aria-busy"\)/);
});

test("file menu reports cancellation and unexpected failures without false success claims", () => {
  assert.match(menu, /error\?\.name === "AbortError" \|\| error\?\.kind === "cancelled"/);
  assert.match(menu, /Could not finish opening/);
  assert.match(menu, /Opening \$\{label\} was cancelled/);
  assert.match(menu, /!announcement\.startsWith\("Could not finish"\)/);
  assert.match(menu, /!announcement\.startsWith\(\x60Opening \$\{label\} was cancelled\.\x60\)/);
});
