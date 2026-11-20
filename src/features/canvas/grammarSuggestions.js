const COMMON_CORRECTIONS = [
  [/\bteh\b/gi, "the", "Spelling"], [/\brecieve\b/gi, "receive", "Spelling"],
  [/\bseperate\b/gi, "separate", "Spelling"], [/\bdefinately\b/gi, "definitely", "Spelling"],
  [/\boccured\b/gi, "occurred", "Spelling"], [/\bwich\b/gi, "which", "Spelling"],
  [/\bdont\b/gi, "don't", "Spelling"], [/\bcant\b/gi, "can't", "Spelling"],
  [/\bwont\b/gi, "won't", "Spelling"], [/\bi\b/g, "I", "Grammar"],
];

export function findGrammarIssues(value) {
  const text = String(value ?? "");
  const issues = [];
  for (const [pattern, replacement, kind] of COMMON_CORRECTIONS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const suggestion = match[0].replace(pattern, replacement);
      if (suggestion !== match[0]) issues.push({
        start: match.index, end: match.index + match[0].length, original: match[0],
        suggestion, kind, message: kind === "Spelling" ? "Possible spelling mistake" : "Use the first-person pronoun “I” in uppercase",
      });
      if (!pattern.global) break;
    }
  }
  for (const [pattern, replacement, message] of [
    [/\ba ([aeiou][a-z]+)/gi, "an $1", "Use “an” before a vowel sound"],
    [/\ban ([^aeiou\s][a-z]+)/gi, "a $1", "Use “a” before a consonant sound"],
    [/\b([a-z])\1{2,}\b/gi, "$1$1", "Check repeated letters"],
    [/\s{2,}/g, " ", "Remove extra spaces"],
  ]) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const suggestion = match[0].replace(pattern, replacement);
      if (suggestion !== match[0]) issues.push({
        start: match.index, end: match.index + match[0].length, original: match[0],
        suggestion, kind: "Grammar", message,
      });
    }
  }
  if (text && /^[a-z]/.test(text)) issues.push({
    start: 0, end: 1, original: text[0], suggestion: text[0].toUpperCase(),
    kind: "Grammar", message: "Capitalize the beginning of the text",
  });
  const trimmed = text.trimEnd();
  if (trimmed && /[a-z0-9]$/i.test(trimmed) && trimmed.split(/\s+/).length > 4) issues.push({
    start: trimmed.length, end: trimmed.length, original: "", suggestion: ".",
    kind: "Grammar", message: "Consider ending this sentence with punctuation",
  });
  const seen = new Set();
  return issues.sort((a, b) => a.start - b.start).filter((issue) => {
    const key = issue.start + ":" + issue.end + ":" + issue.suggestion;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
}
