import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
const canvas = readFileSync(new URL('../src/components/app/SketchiziCanvas.jsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

test('contextual toolbar is rendered for editable selections and supported active drawing tools', () => {
  assert.match(toolbar, /if \(!canEdit \|\| \(!liveSelection\.length && !toolMode\) \|\| !position\) return null/);
  assert.match(toolbar, /const drawingTool = activeToolType === "freedraw"/);
  assert.match(toolbar, /const textTool = activeToolType === "text"/);
  assert.match(toolbar, /activeToolMode === "text" && \["fontFamily", "fontSize", "textAlign"\]\.includes\(group\.id\)/);
  assert.match(toolbar, /\(!onlyTextSelection \|\| toolMode \|\| noteSelection\) && !hasImageSelection/);
  assert.match(toolbar, /const bucketFillTool = \["bucket-fill", "bucketfill", "fill"\]\.includes\(activeToolType\)/);
  assert.match(toolbar, /const drawToShapeTool = \["draw-to-shape", "drawtoshape"\]\.includes\(activeToolType\)/);
  assert.match(toolbar, /api\.updateScene\(\{ appState: appStatePatch \}\)/);
  assert.match(toolbar, /currentItemStrokeColor = patch\.strokeColor/);
  assert.match(toolbar, /currentItemBackgroundColor = patch\.backgroundColor/);
  assert.match(toolbar, /currentItemStrokeWidth = patch\.strokeWidth/);
  assert.match(toolbarSource, /const selectedIds = new Set\(noteSelection \? \[\.\.\.noteGroupIds\]/);
  assert.match(toolbar, /api\.updateScene\(\{ elements: updatedElements, captureUpdate: CaptureUpdateAction\.IMMEDIATELY \}\)/);
  assert.match(toolbar, /version: \(Number\(element\.version\) \|\| 0\) \+ 1/);
  assert.doesNotMatch(toolbar, /if \(!canEdit \|\| propertiesOpen \|\|/);
  assert.match(app, /collaborationCanEdit && selectedCount > 0 && propertiesOpen && \(/);
  assert.match(canvas, /propertiesOpen=\{propertiesOpen\}/);
  assert.match(app, /propertiesOpen=\{propertiesOpen\}[\s\S]*?selectedElements=\{selectedElements\}/);
  assert.match(canvas, /<ContextualFormattingToolbar[\s\S]*?selectedElements=\{selectedElements\}/);
  assert.match(canvas, /canEdit=\{canEdit && !viewModeEnabled\}/);
});

test('Properties hides only formatting controls duplicated by the contextual toolbar', () => {
  const properties = readFileSync(new URL('../src/PropertiesPanel.jsx', import.meta.url), 'utf8');
  assert.ok(properties.includes('hasShapeSelection && !hideDuplicateFormattingControls'));
  assert.ok(properties.includes('hideDuplicateFormattingControls && hasShapeSelection'));
  assert.ok(properties.includes('!hideDuplicateFormattingControls && <div className="property-row">'));
  assert.ok(properties.includes('<label>Align</label>'));
  assert.ok(app.includes('hideDuplicateFormattingControls={true}'));
});

test('More restores the current selection before opening Properties', () => {
  assert.match(app, /selectedIds = selectedElements\.filter\(\(element\) => element && !element\.isDeleted\)\.map\(\(element\) => element\.id\)/);
  assert.match(app, /selectedElementIds: Object\.fromEntries\(selectedIds\.map\(\(id\) => \[id, true\]\)\)/);
  assert.match(app, /onOpenProperties=\{\(\) => \{/);
  assert.match(app, /openPanel\("properties"\)/);
});

test('contextual controls use existing selection update and properties-panel callbacks', () => {
  assert.match(toolbar, /applyToSelected\(\{ strokeColor: color \}\)/);
  assert.match(toolbar, /applyToSelected\(\{ backgroundColor: color \}\)/);
  assert.match(toolbar, /applyToSelected\(\{ strokeWidth: width \}\)/);
  assert.match(toolbar, /applyToSelected\(\{ fontSize:/);
  assert.match(toolbar, /onClick=\{onOpenProperties\}/);
  assert.match(app, /applyToSelected=\{applyToSelected\}/);
  assert.match(app, /onOpenProperties=\{\(\) => \{[\s\S]*?openPanel\("properties"\);[\s\S]*?\}\}/);
});

test('selection toolbar placement accounts for zoom, scroll, and canvas bounds', () => {
  assert.match(toolbar, /appState\.zoom\?\.value/);
  assert.match(toolbar, /appState\.scrollX/);
  assert.match(toolbar, /appState\.scrollY/);
  assert.match(toolbar, /const rightCandidate = selectionRight \+ gap/);
  assert.match(toolbar, /const leftCandidate = selectionLeft - railWidth - gap/);
  assert.match(toolbar, /const selectionCenterY = \(selectionTop \+ selectionBottom\) \/ 2/);
  assert.match(toolbar, /const rootWidth = root\.clientWidth/);
  assert.match(toolbar, /canvasRevision/);
  assert.match(toolbar, /const popoverSide = left \+ barWidth \+ 340 \+ 16 <= rootWidth/);
});

test('contextual toolbar has light, dark, responsive, and focus-visible styling', () => {
  assert.match(styles, /\.contextual-formatting-toolbar/);
  assert.match(styles, /\.app\.theme-dark \.contextual-formatting-toolbar/);
  assert.match(styles, /\.app\.theme-light \.contextual-formatting-toolbar/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?contextual-formatting-toolbar/);
  assert.match(styles, /:focus-visible/);
});


test('Library icon images remain untouched by shape formatting until safe recoloring is supported', () => {
  const canvasTools = readFileSync(new URL('../src/features/canvas/useCanvasTools.js', import.meta.url), 'utf8');
  assert.match(canvasTools, /Keep library image assets untouched/);
  assert.match(canvasTools, /if \(element\.type === "image" && \(element\.customData\?\.iconId \|\| element\.customData\?\.diagramIcon\)\) return element/);
  assert.doesNotMatch(canvasTools, /recolorSvgDataUrl/);
  assert.doesNotMatch(toolbar, /recolorableIconSelection/);
});


test('compact dock constrains overall width and reduces tool button dimensions', () => {
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(dockCss, /min-height: 48px !important/);
  assert.match(dockCss, /padding: 5px 8px !important/);
  assert.match(dockCss, /width: 34px !important/);
  assert.match(dockCss, /max-width: calc\(100vw - 16px\) !important/);
  assert.match(dockCss, /@media \(max-width: 700px\)[\s\S]*?width: 31px !important/);
});


test('zoom and undo redo navigation controls use compact dimensions', () => {
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(dockCss, /\.zoom-actions button,[\s\S]*?width: 34px !important/);
  assert.match(dockCss, /\.undo-redo-buttons button/);
  assert.match(dockCss, /@media \(max-width: 700px\)[\s\S]*?width: 31px !important/);
});


test('floating dock has no enclosing background shell', () => {
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(dockCss, /\.Island\.App-toolbar\[data-sketchizi-dock="true"\][\s\S]*?background: transparent !important/);
  assert.match(dockCss, /border-radius: 0 !important/);
  assert.match(dockCss, /box-shadow: none !important/);
  assert.match(dockCss, /backdrop-filter: none !important/);
});


test('dock hides inline shortcut hints without disabling keyboard shortcuts', () => {
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(dockCss, /\.App-toolbar\[data-sketchizi-dock="true"\] \.ToolIcon__keybinding[\s\S]*?display: none !important/);
  assert.match(dockCss, /Keyboard shortcuts themselves remain available and unchanged/);
});


test('contextual toolbar exposes fill, line, roughness and opacity controls on canvas', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(toolbar, /aria-label="Fill style"/);
  assert.match(toolbar, /aria-label="Line style"/);
  assert.match(toolbar, /"Fill style"/);
  assert.match(toolbar, /"Line style"/);
  assert.match(toolbar, /"Roughness"/);
  assert.match(toolbar, /applyToSelected\(\{ strokeStyle: value \}\)/);
  assert.match(toolbar, /applyToSelected\(\{ roughness: value \}\)/);
  assert.match(toolbar, /applyToSelected\(\{ opacity: Number\(event.target.value\) \}\)/);
  assert.match(dockCss, /\.contextual-formatting-toolbar[\s\S]*?max-width: min\(760px, calc\(100vw - 20px\)\)/);
});


test('contextual toolbar provides canvas layer ordering actions', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  assert.match(toolbar, /aria-label="Layer order"/);
  assert.match(toolbar, /aria-label="Send selection to back"/);
  assert.match(toolbar, /aria-label="Bring selection to front"/);
  assert.match(toolbar, /api\.updateScene\(\{ elements: nextElements \}\)/);
});


test('scroll-back-to-content control is offset above the bottom dock', () => {
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  const rules = dockCss.slice(dockCss.lastIndexOf('/* Keep Excalidraw\'s "Scroll back to content"'));
  assert.match(rules, /\.scroll-back-to-content[\s\S]*?bottom: calc\(var\(--sketchizi-dock-clearance, 64px\)/);
  assert.match(rules, /z-index: 20 !important/);
  assert.match(rules, /@media \(max-height: 620px\)/);
});


test('contextual toolbar stays above bottom dock and keeps frameless high-contrast controls', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(toolbar, /const barWidth = 48/);
  assert.match(toolbar, /const popoverSide = left \+ barWidth \+ 340 \+ 16 <= rootWidth/);
  const frameless = dockCss;
  assert.match(frameless, /background: transparent !important/);
  assert.match(frameless, /border: 0 !important/);
  assert.match(dockCss, /\\.format-icon-button[\\s\\S]*?border-radius: 9px !important/);
  assert.match(dockCss, /--format-popover-surface: #20232c/);
});


test('contextual stroke and fill swatches keep their real colors in both themes', () => {
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  const swatches = dockCss.slice(dockCss.lastIndexOf('/* Icon-triggered formatting popovers'));
  assert.match(swatches, /\\.format-option-swatch[\\s\\S]*?background: var\\(--swatch-color, #fff\\)/);
  assert.match(swatches, /\\.format-option-swatch\\.is-selected/);
  assert.match(swatches, /\\.format-option-swatch\\.is-transparent[\\s\\S]*?repeating-conic-gradient/);
  assert.match(swatches, /--format-popover-surface: #20232c/);
  assert.match(swatches, /outline: 2px solid #7165e8/);
});


test('contextual toolbar offers a native custom stroke and text color picker', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(toolbar, /className="format-option-section"/);
  assert.match(toolbar, /type="color"/);
  assert.match(toolbar, /aria-label="Choose custom color"/);
  assert.match(toolbar, /applyToSelected\(\{ strokeColor: event\.target\.value \}\)/);
  assert.match(dockCss, /\\.format-custom-color input/);
});


test('contextual toolbar clamps to viewport and scrolls its controls on narrow screens', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(toolbar, /const barWidth = 48/);
  const rules = dockCss.slice(dockCss.lastIndexOf('/* Icon-triggered formatting popovers'));
  assert.match(rules, /width: min\\(320px, calc\\(100vw - 72px\\)\\)/);
  assert.match(rules, /overflow: auto/);
  assert.match(rules, /flex-direction: column/);
  assert.match(rules, /\\.format-icon-button/);
});


test('formatting controls are grouped behind compact icon buttons with adjacent popovers', () => {
  assert.match(toolbar, /const GROUPS = \[/);
  assert.match(toolbar, /setOpenGroup\(\(current\) => current === group\.id \? null : group\.id\)/);
  assert.match(toolbar, /className=\{\`format-options-popover side-\$\{position\["--format-popover-side"\]\}\`\}/);
  assert.match(toolbar, /label: "Font family"/);
  assert.match(toolbar, /label: "Font size"/);
  assert.match(toolbar, /Text alignment/);
  assert.match(toolbar, /aria-label="Opacity"/);
  assert.match(toolbar, /aria-label="Layer order"/);
  assert.match(toolbar, /event\.key === "Escape"/);
  assert.match(toolbar, /document\.addEventListener\("pointerdown", onPointerDown\)/);
});

test('formatting popovers use compact rail and viewport-constrained surfaces', () => {
  const dockCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(dockCss, /\.format-icon-rail[\s\S]*?flex-direction: column/);
  assert.match(dockCss, /\.format-options-popover\.side-right[\s\S]*?left: calc\(100% \+ 10px\)/);
  assert.match(dockCss, /\.format-options-popover\.side-left[\s\S]*?right: calc\(100% \+ 10px\)/);
  assert.match(dockCss, /max-height: min\(520px, calc\(100vh - 32px\)\)/);
});


test('Properties panel suppresses duplicate formatting groups when the floating toolbar owns them', () => {
  const propertiesPanel = readFileSync(new URL('../src/PropertiesPanel.jsx', import.meta.url), 'utf8');
  assert.match(propertiesPanel, /!hideDuplicateFormattingControls && <div className="properties-section properties-appearance">/);
  assert.match(propertiesPanel, /!hideDuplicateFormattingControls && hasTextSelection && selectedCount === 1/);
  assert.match(propertiesPanel, /hideDuplicateFormattingControls=\{true\}/);
});


test('custom stroke color picker is visible and remains keyboard-accessible', () => {
  const toolbarSource = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  const toolbarCss = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(toolbarSource, /className="format-custom-color-icon"/);
  assert.match(toolbarSource, /type="color" aria-label="Choose custom color"/);
  assert.match(toolbarCss, /\.format-custom-color-icon[\s\S]*?pointer-events: none/);
  assert.match(toolbarCss, /\.format-custom-color input[\s\S]*?opacity: 0/);
});


test('floating formatting controls follow the selected element type', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  assert.match(toolbar, /const visibleGroups = GROUPS\.filter\(\(group\) => \{/);
  assert.match(toolbar, /return onlyTextSelection;/);
  assert.match(toolbar, /if \(group\.id === "fontFamily" \|\| group\.id === "fontSize" \|\| group\.id === "textAlign"\)/);
  assert.match(toolbar, /onClick=\{\(\) => setOpenGroup\(\(current\) => current === group\.id \? null : group\.id\)\}/);
  assert.match(toolbar, /if \(groupId === "stroke"\)[\s\S]*?hasShape[\s\S]*?hasLine/);
});


test('rectangle and diamond stroke popovers include edge, fill, and custom background controls', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(toolbar, /Choose custom background color/);
  assert.match(toolbar, /onChange=\{\(event\) => applyToSelected\(\{ backgroundColor: event\.target\.value \}\)\}/);
  assert.match(toolbar, /first\\?\\.type === "rectangle" \\|\\| first\\?\\.type === "diamond"[\\s\\S]*?Edges[\\s\\S]*?Square edges[\\s\\S]*?roundness: null[\\s\\S]*?Rounded edges[\\s\\S]*?roundness: \\{ type: 3 \\}/);
  assert.match(toolbar, /\\(hasLine \\|\\| hasShape\\)/);
  assert.match(styles, /\.format-edge-square/);
  assert.match(styles, /\.format-edge-rounded/);
});


test('floating toolbar positions selections from the viewport origin without half-canvas offset', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  assert.match(toolbar, /const selectionLeft = \(sceneBounds\.left \+ scrollX\) \* scaleX;/);
  assert.match(toolbar, /const selectionTop = \(sceneBounds\.top \+ scrollY\) \* scaleY;/);
  assert.doesNotMatch(toolbar, /selection(?:Left|Right) = .*\+ rootWidth \/ 2/);
  assert.doesNotMatch(toolbar, /selection(?:Top|Bottom) = .*\+ rootHeight \/ 2/);
});


test('arrow floating Stroke popover includes arrow type and start/end arrowheads', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/styles/ui-modernization-toolbar-dock.css', import.meta.url), 'utf8');
  assert.match(toolbar, /first\?\.type === "arrow"[\s\S]*?Arrow type[\s\S]*?elbowed: false[\s\S]*?elbowed: true[\s\S]*?Arrowheads/);
  assert.match(toolbar, /aria-label="Start arrowhead"[\s\S]*?startArrowhead[\s\S]*?aria-label="End arrowhead"[\s\S]*?endArrowhead/);
  assert.match(toolbar, /<option value="arrow">Arrow<\/option>[\s\S]*?<option value="bar">Bar<\/option>[\s\S]*?<option value="dot">Dot<\/option>/);
  assert.match(styles, /\.format-arrowhead-control select/);
});


test('floating arrow type controls include straight, curved, and elbow paths', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  assert.match(toolbar, /function curvedArrowPatch\(element\)/);
  assert.match(toolbar, /function straightArrowPatch\(element\)/);
  assert.match(toolbar, /aria-label="Straight arrow"[\s\S]*?straightArrowPatch\(first\)/);
  assert.match(toolbar, /aria-label="Curved arrow"[\s\S]*?curvedArrowPatch\(first\)/);
  assert.match(toolbar, /aria-label="Elbow arrow"[\s\S]*?elbowed: true/);
});


test('floating stroke popover exposes edge controls for line selections too', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  assert.match(toolbar, /first\?\.type === "rectangle" \|\| first\?\.type === "diamond" \|\| first\?\.type === "line"/);
  assert.match(toolbar, /aria-label="Square edges"/);
  assert.match(toolbar, /aria-label="Rounded edges"/);
});


test('floating background color controls are available for line selections', () => {
  const toolbar = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  assert.match(toolbar, /\(!onlyTextSelection \|\| toolMode \|\| noteSelection\) && !hasImageSelection[\s\S]*?format-option-label">Background/);
  assert.match(toolbar, /Choose custom background color/);
});


test('drawing-tool formatting uses current-item defaults and exposes draw, fill, and draw-to-shape modes', () => {
  assert.match(toolbar, /const toolMode = drawingTool \|\| bucketFillTool \|\| drawToShapeTool/);
  assert.match(toolbar, /const onlyTextSelection = liveSelection\.length > 0 && liveSelection\.every/);
  assert.match(toolbar, /GROUPS\.filter\(\(group\) => group\.id === "stroke" \|\| group\.id === "opacity"\)/);
  assert.match(toolbar, /activeGroup === "stroke" && bucketFillTool/);
  assert.match(toolbar, /window\.addEventListener\("sketchizi:activate-tool", onCustomTool\)/);
  assert.match(toolbar, /tool === "bucketfill"[\s\S]*?setCustomToolMode\("fill"\)[\s\S]*?tool === "autoshape"[\s\S]*?setCustomToolMode\("shape"\)/);
  assert.match(toolbar, /aria-label="Pressure enabled"[\s\S]*?applyFormatting\(\{ pressure: true \}\)/);
  assert.match(toolbar, /aria-label="Pressure disabled"[\s\S]*?applyFormatting\(\{ pressure: false \}\)/);
});


test('note selections expose typography and background controls in the floating toolbar', () => {
  const toolbarSource = readFileSync(new URL('../src/components/app/ContextualFormattingToolbar.jsx', import.meta.url), 'utf8');
  assert.match(toolbarSource, /function isNoteFormattingElement\(element\)/);
  assert.match(toolbarSource, /bound\?\.type \|\| ""\)\.toLowerCase\(\) === "text"/);
  assert.match(toolbarSource, /data\.isNote === true/);
  assert.match(toolbarSource, /const noteSelection = liveSelection\.some\(isNoteFormattingElement\)/);
  assert.match(toolbarSource, /const onlyTextSelection = liveSelection\.length > 0 && liveSelection\.every\(isTextFormattingElement\)/);
  assert.match(toolbarSource, /Choose custom background color/);
  assert.match(toolbarSource, /format-option-label format-sub-label">Vertical align/);
  assert.match(toolbarSource, /\["top", "Top"/);
  assert.match(toolbarSource, /\["middle", "Middle"/);
  assert.match(toolbarSource, /\["bottom", "Bottom"/);
  assert.match(toolbarSource, /currentItemVerticalAlign = patch\.verticalAlign/);
  assert.match(toolbarSource, /const firstTextFormattingElement =/);
  assert.match(toolbarSource, /const firstNoteBackgroundElement =/);
  assert.match(toolbarSource, /hasSeparateNoteText && textOnlyPatch && element\.type !== "text"/);
  assert.match(toolbarSource, /hasSeparateNoteText && backgroundOnlyPatch && element\.type === "text"/);
  assert.match(toolbarSource, /const selectedIds = new Set\\(noteSelection \\? \\[\\.\\.\\.noteGroupIds\\]/);
});
