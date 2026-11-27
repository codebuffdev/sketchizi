import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_CODE_FILENAME, FILENAME_PLACEHOLDER, MAX_FILENAME_LENGTH, badgeForFilename, effectiveFilename, languageForFilename, sanitizeFilename } from "../../features/canvas/codeBlock/codeLanguages.js";
import { CODE_METRICS, measureCodeBlock } from "../../features/canvas/codeBlock/codeBlockLayout.js";
import { CODE_BORDER_WIDTH, getCodeTheme, isItalicToken } from "../../features/canvas/codeBlock/codeSyntaxTheme.js";
import { tokenizeCode } from "../../features/canvas/codeBlock/codeTokenizer.js";
import { getEnterEdit, getTabEdit, normalizePastedCode } from "../../features/canvas/codeBlock/codeEditing.js";
import { copyTextToClipboard } from "../../features/canvas/codeBlock/copyToClipboard.js";
import { MAX_CODE_LENGTH } from "../../features/canvas/codeBlock/codeBlockModel.js";

/** Replace a textarea range through the browser's edit pipeline so Ctrl+Z keeps working. */
function applyTextareaEdit(textarea, edit) {
  textarea.focus();
  textarea.setSelectionRange(edit.replaceStart, edit.replaceEnd);
  let done = false;
  try { done = document.execCommand("insertText", false, edit.text); } catch { done = false; }
  if (!done) {
    textarea.setRangeText(edit.text, edit.replaceStart, edit.replaceEnd, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  }
  textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
}

/**
 * Floating DOM editor for a code card. Same geometry and palette as the canvas
 * renderer: the card auto-grows with its text and sits under a filename header.
 */
// `zoom` is the canvas zoom multiplied by the block's resize scale, so the overlay matches the canvas size exactly.
export default function CodeBlockEditor({ session, left, top, zoom, theme, onCommit }) {
  const [code, setCode] = useState(session.data.code);
  const [filename, setFilename] = useState(session.data.filename);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef(null);
  const filenameRef = useRef(null);
  const rootRef = useRef(null);
  const committedRef = useRef(false);
  const copiedTimerRef = useRef(0);
  const latestRef = useRef({ code, filename, box: session.data.box });

  const palette = getCodeTheme(theme);
  const name = effectiveFilename(filename);
  const language = languageForFilename(name);
  const badge = badgeForFilename(name);
  // The block's current (possibly user-resized) natural size is a floor: it only grows when the code overflows it.
  const floor = session.data.box;
  const layout = useMemo(() => measureCodeBlock(code, { minWidth: floor?.width, minHeight: floor?.height }), [code, floor?.width, floor?.height]);
  latestRef.current = { code, filename, box: { width: layout.width, height: layout.height } };
  const tokenLines = useMemo(() => tokenizeCode(code, language), [code, language]);

  const commit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    onCommit({ code: latestRef.current.code, filename: effectiveFilename(latestRef.current.filename), box: latestRef.current.box });
  }, [onCommit]);

  useLayoutEffect(() => {
    if (session.focus === "filename") { filenameRef.current?.focus(); filenameRef.current?.select(); return; }
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, [session.focus]);

  // Leaving the editor (click on the canvas, focus moving elsewhere) commits it.
  useEffect(() => {
    const onPointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) commit();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [commit]);
  useEffect(() => () => window.clearTimeout(copiedTimerRef.current), []);

  const handleKeyDown = (event) => {
    event.stopPropagation(); // keep Excalidraw / app shortcuts out of the editor
    if (event.nativeEvent.isComposing) return;
    const textarea = event.currentTarget;
    if (event.key === "Escape") { event.preventDefault(); commit(); return; }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); commit(); return; }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "Tab") {
      event.preventDefault();
      applyTextareaEdit(textarea, getTabEdit({ value: textarea.value, selectionStart: textarea.selectionStart, selectionEnd: textarea.selectionEnd, shiftKey: event.shiftKey }));
    } else if (event.key === "Enter") {
      event.preventDefault();
      applyTextareaEdit(textarea, getEnterEdit({ value: textarea.value, selectionStart: textarea.selectionStart, selectionEnd: textarea.selectionEnd, language }));
    }
  };

  const handlePaste = (event) => {
    event.stopPropagation();
    const text = event.clipboardData?.getData("text/plain");
    if (typeof text !== "string") return;
    event.preventDefault();
    const textarea = event.currentTarget;
    applyTextareaEdit(textarea, {
      replaceStart: textarea.selectionStart,
      replaceEnd: textarea.selectionEnd,
      text: normalizePastedCode(text),
      selectionStart: textarea.selectionStart + normalizePastedCode(text).length,
      selectionEnd: textarea.selectionStart + normalizePastedCode(text).length,
    });
  };

  const handleCopy = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const ok = await copyTextToClipboard(latestRef.current.code);
    if (!ok) return;
    setCopied(true);
    window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), 1400);
  };

  const cssVars = {
    "--cb-surface": palette.surface,
    "--cb-border": palette.border,
    "--cb-border-width": `${CODE_BORDER_WIDTH}px`,
    "--cb-header-text": palette.headerText,
    "--cb-badge-text": palette.badgeText,
    "--cb-badge-fill": palette.badgeFill,
    "--cb-badge-border": palette.badgeBorder,
    "--cb-plain": palette.tokens.plain,
    "--cb-font-size": `${CODE_METRICS.fontSize}px`,
    "--cb-line-height": `${CODE_METRICS.lineHeight}px`,
    "--cb-pad-x": `${CODE_METRICS.paddingX}px`,
    "--cb-pad-y": `${CODE_METRICS.paddingY}px`,
    "--cb-radius": `${CODE_METRICS.radius}px`,
    "--cb-tab-size": CODE_METRICS.tabSize,
  };

  return (
    <div
      ref={rootRef}
      className="sk-code-editor"
      data-code-theme={theme}
      data-testid="code-block-editor"
      style={{ ...cssVars, left, top, width: layout.width, transform: `scale(${zoom})` }}
      onFocus={(event) => event.stopPropagation()}
      onMouseDown={(event) => {
        // Clicking dead space inside the editor must not blur (and so commit) it.
        if (!(event.target instanceof Element) || !event.target.closest("input, textarea, button")) event.preventDefault();
      }}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        if (typeof document.hasFocus === "function" && !document.hasFocus()) return; // window switch, not a real exit
        commit();
      }}
    >
      <div className="sk-code-editor__header" style={{ height: CODE_METRICS.headerHeight, marginBottom: CODE_METRICS.headerGap }}>
        <input
          ref={filenameRef}
          className="sk-code-editor__filename"
          type="text"
          value={filename}
          placeholder={FILENAME_PLACEHOLDER}
          maxLength={MAX_FILENAME_LENGTH}
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          aria-label="Code block filename"
          style={{ width: `${Math.max(10, Math.min(MAX_FILENAME_LENGTH, (filename || FILENAME_PLACEHOLDER).length + 2))}ch` }}
          onChange={(event) => setFilename(sanitizeFilename(event.target.value))}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") { event.preventDefault(); textareaRef.current?.focus(); }
            else if (event.key === "Escape") { event.preventDefault(); commit(); }
          }}
        />
        {badge ? <span className="sk-code-editor__badge" data-testid="code-block-badge">{badge}</span> : null}
        <button type="button" className="sk-code-editor__copy" aria-label="Copy code" onMouseDown={(event) => event.preventDefault()} onClick={handleCopy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="sk-code-editor__card" style={{ width: layout.width, height: layout.cardHeight }}>
        <pre className="sk-code-editor__highlight" aria-hidden="true">
          {tokenLines.map((tokens, row) => (
            <span className="sk-code-editor__line" key={row}>
              {tokens.map((token, index) => (
                <span key={index} style={{ color: palette.tokens[token.type] || palette.tokens.plain, fontStyle: isItalicToken(token.type) ? "italic" : undefined }}>{token.text}</span>
              ))}
              {"\n"}
            </span>
          ))}
        </pre>
        <textarea
          ref={textareaRef}
          className="sk-code-editor__input"
          value={code}
          wrap="off"
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          aria-label={`Code (${name || DEFAULT_CODE_FILENAME})`}
          onChange={(event) => setCode(event.target.value.slice(0, MAX_CODE_LENGTH))}
          onKeyDown={handleKeyDown}
          onKeyUp={(event) => event.stopPropagation()}
          onPaste={handlePaste}
          onCopy={(event) => event.stopPropagation()}
          onCut={(event) => event.stopPropagation()}
        />
      </div>
    </div>
  );
}
