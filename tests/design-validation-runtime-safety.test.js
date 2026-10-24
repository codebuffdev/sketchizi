import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const persistenceSource = readFileSync(new URL("../src/features/persistence/useSketchPersistence.js", import.meta.url), "utf8");
const profileSource = readFileSync(new URL("../src/features/design/model/designDocument.js", import.meta.url), "utf8");

test("architecture validation avoids scheduling state updates for identical results", () => {
  assert.match(appSource, /architectureValidationSignatureRef = useRef\(""\)/);
  assert.match(appSource, /const result = validateArchitectureWithAwsRules\(graph\)/);
  assert.match(appSource, /const signature = JSON\.stringify\(result\)/);
  assert.match(appSource, /if \(signature === architectureValidationSignatureRef\.current\) return/);
  assert.match(appSource, /architectureValidationSignatureRef\.current = signature;\s*setArchitectureValidation\(result\)/);
});

test("Design Studio handoff guards editor readiness and confirms replacing a non-empty canvas", () => {
  assert.match(appSource, /<CreateDesignScreen[\s\S]*onCreate=\{createDesignFromStudio\}/);
  assert.match(appSource, /if \(!api\?\.updateScene \|\| !sketchReady\)/);
  assert.match(appSource, /window\.confirm\("Creating a new design will replace the current canvas/);
  assert.match(appSource, /extensions: withDesignProfile\(documentMetadataRef\.current\?\.extensions \|\| \{\}, profile\)/);
  assert.match(appSource, /queueSketchSave\(elements, api\.getAppState\?\.\(\) \|\| \{\}\)/);
});

test("canvas persistence callbacks keep stable identities and declare dependencies", () => {
  assert.match(persistenceSource, /const persistSketchNow = useCallback\(\(payload, revision = saveRevisionRef\.current\) => \{/);
  assert.match(persistenceSource, /\}, \[documentMetadataRef\]\);\s*\n\s*const queueSketchSave = useCallback/);
  assert.match(persistenceSource, /\}, \[apiRef, documentMetadataRef, persistSketchNow, sketchReady\]\);\s*\n\s*const retryLocalSave = useCallback/);
  assert.match(persistenceSource, /\}, \[apiRef, documentMetadataRef, persistSketchNow\]\);\s*\n\s*const downloadRecoveryBackup = useCallback/);
  assert.match(persistenceSource, /\}, \[apiRef, documentMetadataRef\]\);/);
});

test("design profile normalization remains defensive for unknown metadata", () => {
  assert.match(profileSource, /DESIGN_SCHEMA_VERSION = 1/);
  assert.match(profileSource, /if \(!value \|\| typeof value !== "object" \|\| Array\.isArray\(value\)\) return null/);
  assert.match(profileSource, /includeCache: templateOptions\?\.includeCache === true/);
  assert.match(profileSource, /region: typeof templateOptions\?\.region === "string"/);
  assert.match(profileSource, /environment: typeof templateOptions\?\.environment === "string"/);
});
