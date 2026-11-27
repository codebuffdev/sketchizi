import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const jsx = readFileSync(new URL("../src/components/app/CanvasStartDate.jsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/components/app/CanvasStartDate.css", import.meta.url), "utf8");

test("accordion defaults: history expanded, start-date calendar collapsed, reset on every open", () => {
  assert.match(jsx, /const \[activityOpen, setActivityOpen\] = useState\(true\);/);
  assert.match(jsx, /const \[calendarOpen, setCalendarOpen\] = useState\(false\);/);
  assert.match(jsx, /if \(!open\) \{\s*setActivityOpen\(true\);\s*setCalendarOpen\(false\);\s*\}/);
});

test("history section comes first and the start-date row carries title, date badge and Reset", () => {
  assert.ok(jsx.indexOf("Canvas activity history") < jsx.indexOf("Document Start Date</span>"));
  assert.match(jsx, /className="sd-badge">\{label\}/);
  assert.match(jsx, />Reset<\/button>/);
  // Reset is a sibling of the toggle, never nested inside another button.
  assert.match(jsx, /<\/button>\s*<button type="button" className="canvas-start-date-reset"/);
  assert.match(jsx, /aria-expanded=\{calendarOpen\}/);
  assert.match(jsx, /aria-expanded=\{activityOpen\}/);
});

test("picking a day keeps the popover open and filters history to that calendar day", () => {
  const select = jsx.slice(jsx.indexOf("const selectDate"), jsx.indexOf("const togglePopover"));
  assert.doesNotMatch(select, /setOpen\(false\)/);
  assert.match(jsx, /toDateKey\(new Date\(entry\.startedAt\)\) === dateValue/);
  assert.match(jsx, /formatDay\(selectedDate\)/);
  assert.match(jsx, /No sessions recorded on this date\./);
});

test("dismissal on outside pointerdown and Escape is preserved", () => {
  assert.match(jsx, /addEventListener\("pointerdown", closeOutside, true\)/);
  assert.match(jsx, /event\.key !== "Escape"/);
});

test("themes use the specified surfaces, text, muted and active colours", () => {
  for (const token of ["#FFFFFF", "#0F172A", "#64748B", "#181B20", "#F8FAFC", "#94A3B8", "#6D28D9", "#7C3AED"]) {
    assert.ok(css.includes(token), `missing ${token}`);
  }
  assert.match(css, /\.app\.theme-dark \.canvas-start-date-popover \{[^}]*--sd-surface: #181B20/s);
  assert.match(css, /\.canvas-start-date-day\.is-selected[^{]*\{[^}]*background: var\(--sd-active\)/s);
  assert.match(css, /scrollbar-color: var\(--sd-thumb\) transparent/);
  assert.match(css, /::-webkit-scrollbar-thumb/);
});

test("accordion animates grid rows and honours reduced motion", () => {
  assert.match(css, /grid-template-rows: 0fr/);
  assert.match(css, /\.sd-collapse\.is-open \{ grid-template-rows: 1fr/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
