import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  hasCloudSceneChange,
  isActiveCloudSession,
  usesLocalAutosave,
} from "../src/features/workspace/cloudSavePolicy.js";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
const preferences = readFileSync(new URL("../src/features/navigation/useSketchiziPreferences.js", import.meta.url), "utf8");
const files = readFileSync(new URL("../src/features/files/useFileManager.js", import.meta.url), "utf8");

test("local autosave resumes once a cloud diagram is detached", () => {
  assert.equal(usesLocalAutosave("", false), true);
  assert.equal(usesLocalAutosave("cloud-diagram", false), false);
  assert.equal(usesLocalAutosave("cloud-diagram", true), true);
  assert.match(app, /cloudDetachedRef\.current = true/);
  assert.match(app, /if \(usesLocalAutosave\(cloudDiagramId, cloudDetachedRef\.current\)\) \{\s*queueLocalSketchSave\(elements, appState\)/);
  assert.match(files, /dispatchEvent\(new CustomEvent\("sketchizi:detach-cloud-document"\)\)/);
});

test("an empty visible cloud diagram saves deletions, but not transient empty callbacks", () => {
  assert.equal(hasCloudSceneChange(null), false);
  assert.equal(hasCloudSceneChange([]), false);
  assert.equal(hasCloudSceneChange([null, undefined]), false);
  assert.equal(hasCloudSceneChange([{ id: "one", isDeleted: false }]), true);
  assert.equal(hasCloudSceneChange([{ id: "one", isDeleted: true }]), true);
  assert.equal(hasCloudSceneChange([{ id: "one", isDeleted: true }, { id: "two", isDeleted: true }]), true);
  assert.match(app, /if \(!cloudSceneReadyRef\.current \|\| !cloudSessionRef\.current\.active/);
  assert.match(app, /if \(!hasCloudSceneChange\(elements\)\) return/);
});

test("in-flight saves from a detached session cannot overwrite new document status", () => {
  const original = { active: true, diagramId: "cloud-one", revision: 7 };
  const replaced = { active: false, diagramId: "", revision: null };
  assert.equal(isActiveCloudSession(original, original), true);
  assert.equal(isActiveCloudSession(original, replaced), false);
  assert.equal(isActiveCloudSession({ active: false }, original), false);
  assert.match(app, /if \(!isActiveCloudSession\(session, cloudSessionRef\.current\)\) return;\s*const revision = session\.revision/);
  assert.match(app, /const result = await workspaceClient\.saveDiagram\(session\.diagramId, revision, document\);[\s\S]*?if \(!isActiveCloudSession\(session, cloudSessionRef\.current\)\) return/);
  assert.match(app, /\.catch\(\(error\) => \{\s*if \(!isActiveCloudSession\(session, cloudSessionRef\.current\)\) return/);
});

test("Reset canvas uses the same guarded new-document path, including cloud detachment", () => {
  assert.match(preferences, /fileActionsRef\.current\.createNewFile\?\.\(\)/);
  assert.match(preferences, /if \(!canEdit\) return;/);
  assert.doesNotMatch(preferences, /clearSketch\(\)|clearEmergencyBackup\(\)/);
  assert.match(files, /if \(!confirmCanvasReplacement\("create a new drawing"\)\) return/);
  assert.match(files, /new CustomEvent\("sketchizi:detach-cloud-document"\)/);
  assert.match(files, /api\.history\?\.clear\?\.\(\)/);
});

test("detached cloud drawings immediately display local status and local save controls", () => {
  assert.match(app, /const \[cloudDetached, setCloudDetached\] = useState\(false\)/);
  assert.match(app, /cloudDetachedRef\.current = true;\s*setCloudDetached\(true\)/);
  assert.match(app, /currentDocumentName=\{cloudDiagramId && !cloudDetached \? cloudDocumentName/);
  assert.match(app, /isCloudDocument=\{Boolean\(cloudDiagramId && !cloudDetached\)\}/);
  assert.ok(app.includes("cloudDiagramId && !cloudDetached && <div className="));
  assert.match(app, /onSaveToCloud=\{\(\) => cloudDiagramId && !cloudDetachedRef\.current \? saveCloudDiagramNow\(\) : setCloudSaveDialogOpen\(true\)\}/);
  assert.match(app, /if \(cloudDiagramId && !cloudDetachedRef\.current\) \{\s*if \(!cloudSessionRef\.current\.active\)/);
});

test("new local drawing clears storage only after all older writes settle", () => {
  const persistence = readFileSync(new URL("../src/features/persistence/useSketchPersistence.js", import.meta.url), "utf8");
  assert.match(persistence, /const resetLocalSketch = useCallback\(\(\) => \{/);
  assert.match(persistence, /saveRequestRef\.current = saveRequestRef\.current\.catch\(\(\) => \{\}\)\.then\(async \(\) => \{\s*await clearSketch\(\)/);
  assert.match(persistence, /const revision = \+\+saveRevisionRef\.current/);
  assert.match(persistence, /if \(revision === saveRevisionRef\.current\) \{\s*setStorageError\(null\)/);
  assert.match(files, /void resetLocalSketch\(\)/);
  assert.doesNotMatch(files, /clearSketch\(\)\.catch/);
  assert.match(app, /resetLocalSketch, downloadRecoveryBackup/);
});
