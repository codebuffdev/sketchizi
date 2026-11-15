/**
 * Markdown-style list shortcuts for Excalidraw's plain-text editor.
 * The list markers remain ordinary text so existing Excalidraw persistence,
 * collaboration and undo/redo continue to use the native text element model.
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
      return {
        start: lineStart,
        end: selectionStart,
        text: `${bullet[1]}• `,
      };
    }
    const numbered = beforeCursor.match(/^(\s*)(\d+)\.$/);
    if (numbered) {
      return {
        start: lineStart,
        end: selectionStart,
        text: `${numbered[1]}${numbered[2]}. `,
      };
    }
    return null;
  }

  if (key === "Enter") {
    const listItem = beforeCursor.match(/^(\s*)(•|(\d+)\.)\s+(.*)$/);
    if (!listItem) return null;
    const [, indent, marker, number, content] = listItem;
    if (!content.trim() && !afterCursor.length) {
      // Enter on an empty item exits the list and leaves a blank paragraph.
      return { start: lineStart, end: selectionStart, text: "\n" };
    }
    const nextMarker = number ? `${Number(number) + 1}. ` : "• ";
    return {
      start: selectionStart,
      end: selectionStart,
      text: `\n${indent}${nextMarker}`,
    };
  }

  if (key === "Backspace" && !afterCursor.length) {
    const emptyItem = beforeCursor.match(/^(\s*)(?:•|(\d+)\.)\s+$/);
    if (emptyItem) {
      return {
        start: lineStart,
        end: selectionStart,
        text: emptyItem[1],
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
