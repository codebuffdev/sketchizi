import React, { useState } from "react";

const ENDPOINT = "https://api.languagetool.org/v2/check";
const MAX_TEXT_LENGTH = 20_000;

export async function checkGrammar(text) {
  const value = String(text || "");
  if (!value.trim()) return [];
  if (value.length > MAX_TEXT_LENGTH) {
    throw new Error("Please check text in sections under 20,000 characters.");
  }
  const body = new URLSearchParams({ text: value, language: "auto", preferredVariants: "en-US,en-GB" });
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(response.status === 429
    ? "LanguageTool is busy. Please wait a moment and try again."
    : "Grammar check is temporarily unavailable.");
  const data = await response.json();
  return (data.matches || []).map((match) => ({
    message: match.message,
    offset: match.offset,
    length: match.length,
    replacements: (match.replacements || []).slice(0, 4).map((item) => item.value).filter(Boolean),
    context: match.context?.text || "",
    rule: match.rule?.category?.name || "Grammar",
  }));
}

export default function GrammarCheck({ text, onApply, isDarkTheme = false, className = "" }) {
  const [matches, setMatches] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const runCheck = async () => {
    setLoading(true); setError(""); setMatches(null);
    try { setMatches(await checkGrammar(text)); }
    catch (reason) { setError(reason?.message || "Grammar check is temporarily unavailable."); }
    finally { setLoading(false); }
  };
  const apply = (match, replacement) => {
    const value = String(text || "");
    if (value.slice(match.offset, match.offset + match.length) !== value.slice(match.offset, match.offset + match.length)) return;
    onApply?.(value.slice(0, match.offset) + replacement + value.slice(match.offset + match.length));
    setMatches((current) => (current || []).filter((item) => item !== match));
  };
  return (
    <div className={`sketchizi-grammar-check${isDarkTheme ? " is-dark" : ""} ${className}`}>
      <button type="button" className="sketchizi-grammar-trigger" onClick={runCheck} disabled={loading || !String(text || "").trim()}>
        {loading ? "Checking…" : "Check grammar"}
      </button>
      <a className="sketchizi-grammar-credit" href="https://languagetool.org" target="_blank" rel="noreferrer">LanguageTool</a>
      {error && <p className="sketchizi-grammar-error" role="status">{error}</p>}
      {matches && <div className="sketchizi-grammar-results" role="status">
        {matches.length === 0 ? <p>No grammar or punctuation suggestions.</p> : matches.map((match, index) => (
          <div className="sketchizi-grammar-match" key={`${match.offset}-${index}`}>
            <span>{match.message}</span>
            {match.replacements.length ? <div className="sketchizi-grammar-replacements">
              {match.replacements.map((replacement) => <button type="button" key={replacement} onClick={() => apply(match, replacement)}>{replacement}</button>)}
            </div> : <small>No suggested replacement</small>}
          </div>
        ))}
      </div>}
    </div>
  );
}
