/**
 * Markdown-style list shortcuts for Excalidraw plain-text editor.
 * Markers remain text for native scene persistence and collaboration.
 */

/** Heading level -> font size (px). Body text is restored to BODY_FONT_SIZE. */
export const MARKDOWN_HEADING_SIZES = Object.freeze({ 1: 32, 2: 26, 3: 22 });
export const BODY_FONT_SIZE = 20;

function currentLine(value, caret) {
  const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
  const nextNewline = value.indexOf("\n", caret);
  return { lineStart, lineEnd: nextNewline === -1 ? value.length : nextNewline };
}

/**
 * `input` fallback (IME / mobile keyboards that report key "Unidentified"):
 * if the caret sits right after a just-typed "# ", "## " or "### " at the
 * start of its line, strip that prefix and keep whatever text follows it.
 */
export function getMarkdownHeadingInputEdit({ value, selectionStart, selectionEnd }) {
  if (typeof value !== "string" || selectionStart !== selectionEnd) return null;
  const { lineStart, lineEnd } = currentLine(value, selectionStart);
  const match = value.slice(lineStart, lineEnd).match(/^(#{1,3})\s(.*)$/);
  if (!match || selectionStart !== lineStart + match[1].length + 1) return null;
  const level = match[1].length;
  return { start: lineStart, end: selectionStart, text: "", headingLevel: level, headingFontSize: MARKDOWN_HEADING_SIZES[level] };
}

export function getMarkdownListEdit({ value, selectionStart, selectionEnd, key, isHeading = false }) {
  if (typeof value !== "string" || selectionStart !== selectionEnd) return null;

  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const nextNewline = value.indexOf("\n", selectionStart);
  const lineEnd = nextNewline === -1 ? value.length : nextNewline;
  const beforeCursor = value.slice(lineStart, selectionStart);
  const afterCursor = value.slice(selectionStart, lineEnd);

  if (key === " ") {
    // Markdown heading markers: # / ## / ### typed at the start of a line,
    // even in front of existing text ("hello" -> "# hello" -> H1 "hello").
    // Only the prefix is replaced, so the caret lands before the old text.
    const heading = beforeCursor.match(/^(\s*)(#{1,3})$/);
    if (heading) {
      const level = heading[2].length;
      return {
        start: lineStart,
        end: selectionStart,
        text: heading[1],
        headingLevel: level,
        headingFontSize: MARKDOWN_HEADING_SIZES[level],
      };
    }
    if (afterCursor.length) return null;
    const numbered = beforeCursor.match(/^(\s*)(\d+)\.$/);
    if (numbered) {
      return { start: lineStart, end: selectionStart, text: numbered[1] + numbered[2] + "․ " };
    }
    const bullet = beforeCursor.match(/^(\s*)([-*])$/);
    if (bullet) {
      return { start: lineStart, end: selectionStart, text: `${bullet[1]}● ` };
    }
    return null;
  }

  if (key === "Enter") {
    const listItem = beforeCursor.match(/^(\s*)(●|\d+․)\s+(.*)$/);
    if (!listItem) return null;
    const [, indent, marker, content] = listItem;
    if (!content.trim() && !afterCursor.length) {
      return { start: lineStart, end: selectionStart, text: "\n" };
    }
    const number = marker.match(/^(\d+)․$/);
    const nextMarker = number ? `${Number(number[1]) + 1}․ ` : "● ";
    return { start: selectionStart, end: selectionStart, text: `\n${indent}${nextMarker}` };
  }

  if (key === "Backspace") {
    // Caret at offset 0 of a heading box: revert to body text, delete nothing.
    if (isHeading && selectionStart === 0) {
      return { start: 0, end: 0, text: "", revertHeading: true, headingFontSize: BODY_FONT_SIZE };
    }
    // Undo unordered-list conversion: restore the typed hyphen.
    const bulletMarker = beforeCursor.match(/^(\s*)●\s+$/);
    if (bulletMarker) {
      return {
        start: lineStart,
        end: selectionStart,
        text: afterCursor.length ? `${bulletMarker[1]}- ` : `${bulletMarker[1]}-`,
      };
    }

    // Undo ordered-list conversion: restore the literal number.
    const numberedMarker = beforeCursor.match(/^(\s*)(\d+)․\s+$/);
    if (numberedMarker) {
      return {
        start: lineStart,
        end: selectionStart,
        text: afterCursor.length ? `${numberedMarker[1]}${numberedMarker[2]} ` : `${numberedMarker[1]}${numberedMarker[2]}`,
      };
    }
  }

  return null;
}

export function applyMarkdownListEdit(textarea, edit) {
  if (!textarea || !edit) return false;
  if (edit.revertHeading) return true; // style-only: leave the text untouched
  textarea.setRangeText(edit.text, edit.start, edit.end, "end");
  const inputEvent = typeof InputEvent === "function"
    ? new InputEvent("input", { bubbles: true, inputType: "insertText", data: edit.text })
    : new Event("input", { bubbles: true });
  textarea.dispatchEvent(inputEvent);
  return true;
}
