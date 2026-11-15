/**
 * Markdown-style list shortcuts for Excalidraw's plain-text editor.
 * List markers remain ordinary text so existing Excalidraw persistence,
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
    // Keep the hyphen visible as the actual bullet marker. An asterisk prefix
    // is normalized to the same marker for consistent list continuation.
    const bullet = beforeCursor.match(/^(\s*)\*$/);
    if (bullet) {
      return {
        start: lineStart,
        end: selectionStart,
        text: `${bullet[1]}- `,
      };
    }
    // A typed "- " or "1. " is already the visible list-start indicator.
    return null;
  }

  if (key === "Enter") {
    const listItem = beforeCursor.match(/^(\s*)(-|\d+\.)\s+(.*)$/);
    if (!listItem) return null;
    const [, indent, marker, content] = listItem;
    if (!content.trim() && !afterCursor.length) {
      // Enter on an empty item exits the list and leaves a blank paragraph.
      return { start: lineStart, end: selectionStart, text: "\n" };
    }
    const number = marker.match(/^(\d+)\.$/);
    const nextMarker = number ? `${Number(number[1]) + 1}. ` : "- ";
    return {
      start: selectionStart,
      end: selectionStart,
      text: `\n${indent}${nextMarker}`,
    };
  }

  if (key === "Backspace") {
    // Backspace at the boundary between a numbered marker and its content
    // switches the current item to a hyphen bullet, preserving its text.
    const numberedMarker = beforeCursor.match(/^(\s*)\d+\.\s+$/);
    if (numberedMarker) {
      return {
        start: lineStart,
        end: selectionStart,
        text: `${numberedMarker[1]}- `,
      };
    }

    // Backspace on an empty bullet item removes its marker and exits the list.
    if (!afterCursor.length) {
      const emptyBullet = beforeCursor.match(/^(\s*)-\s+$/);
      if (emptyBullet) {
        return {
          start: lineStart,
          end: selectionStart,
          text: emptyBullet[1],
        };
      }
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
