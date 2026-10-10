import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("service worker bypasses authentication API cache handling", async () => {
  const source = await readFile(new URL("../public/service-worker.js", import.meta.url), "utf8");
  assert.match(source, /url\.pathname === "\/api\/auth" \|\| url\.pathname\.startsWith\("\/api\/auth\/"\)/);
  assert.match(source, /never cache sessions, CSRF tokens, OAuth callbacks/);
});

test("auth client uses same-origin endpoints and does not persist credentials", async () => {
  const source = await readFile(new URL("../src/features/auth/authClient.js", import.meta.url), "utf8");
  assert.match(source, /"\/api\/auth\/me"/);
  assert.match(source, /"\/api\/auth\/logout"/);
  assert.match(source, /credentials: "same-origin"/);
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});
