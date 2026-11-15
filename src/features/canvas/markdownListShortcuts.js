/**
 * Markdown-style list shortcuts for Excalidraw plain-text editor.
 * Markers remain text for native scene persistence and collaboration.
 */

export function getMarkdownListEdit({ value, selectionStart, selectionEnd, key }) {
  if (typeof value !== "string" || selectionStart !== selectionEnd) return null;

  const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
  const nextNewline = value.indexOf("\n", selectionStart);
  const lineEnd = nextNewline === -1 ? value.length : nextNewline;
  const beforeCursor = value.slice(lineStart, selectionStart);
  const afterCursor = value.slice(selectionStart, lineEnd);

  if (key === " ") {
    if (afterCursor.length) return null;
    const bullet = beforeCursor.match(/^(\s*)([-*])$/);
    if (bullet) {
      return { start: lineStart, end: selectionStart, text: `${bullet[1]}● ` };
    }
    return null;
  }

  if (key === "Enter") {
    const listItem = beforeCursor.match(/^(\s*)(●|\d+\.)\s+(.*)$/);
    if (!listItem) return null;
    const [, indent, marker, content] = listItem;
    if (!content.trim() && !afterCursor.length) {
      return { start: lineStart, end: selectionStart, text: "\n" };
    }
    const number = marker.match(/^(\d+)\.$/);
    const nextMarker = number ? `${Number(number[1]) + 1}․ ` : "● ";
    return { start: selectionStart, end: selectionStart, text: `\n${indent}${nextMarker}` };
  }

  if (key === "Backspace") {
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
    const numberedMarker = beforeCursor.match(/^(\s*)(\d+)\.\s+$/);
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
  textarea.setRangeText(edit.text, edit.start, edit.end, "end");
  const inputEvent = typeof InputEvent === "function"
    ? new InputEvent("input", { bubbles: true, inputType: "insertText", data: edit.text })
    : new Event("input", { bubbles: true });
  textarea.dispatchEvent(inputEvent);
  return true;
}
