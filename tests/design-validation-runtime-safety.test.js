import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const dialogSource = readFileSync(new URL("../src/features/design/ui/DesignValidationDialog.jsx", import.meta.url), "utf8");
const persistenceSource = readFileSync(new URL("../src/features/persistence/useSketchPersistence.js", import.meta.url), "utf8");

test("design diagnostics avoid scheduling state updates for identical validation results", () => {
  assert.match(appSource, /liveDesignDiagnosticsSignatureRef = useRef\("\[\]"\)/);
  assert.match(appSource, /const nextDiagnostics = validateDesignTemplate\(elements, designProfile\)/);
  assert.match(appSource, /const nextSignature = JSON\.stringify\(nextDiagnostics\)/);
  assert.match(appSource, /if \(nextSignature === liveDesignDiagnosticsSignatureRef\.current\) return/);
  assert.match(appSource, /liveDesignDiagnosticsSignatureRef\.current = nextSignature;\s*setLiveDesignDiagnostics\(nextDiagnostics\)/);
});

test("design validation dialog respects its open state", () => {
  assert.match(dialogSource, /function DesignValidationDialog\(\{ open,/);
  assert.match(dialogSource, /if \(!open\) return null;/);
});

test("canvas persistence callbacks keep stable identities between renders", () => {
  assert.match(persistenceSource, /const persistSketchNow = useCallback\(\(payload\) => \{/);
  assert.match(persistenceSource, /\}, \[\]\);\s*\n\s*const queueSketchSave = useCallback/);
  assert.match(persistenceSource, /\}, \[apiRef, documentMetadataRef, persistSketchNow, sketchReady\]\);/);
  assert.match(appSource, /const handleStrictConnectionRejected = useCallback\(/);
  assert.match(appSource, /onStrictConnectionRejected: handleStrictConnectionRejected/);
});
