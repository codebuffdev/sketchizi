function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function subsequenceMatch(needle, haystack) {
  let cursor = 0;
  for (const character of haystack) {
    if (character === needle[cursor]) cursor += 1;
    if (cursor === needle.length) return true;
  }
  return false;
}

function scoreTerm(term, fields) {
  let best = 0;
  for (const field of fields) {
    if (!field) continue;
    if (field === term) best = Math.max(best, 120);
    else if (field.startsWith(term)) best = Math.max(best, 100);
    else if (field.split(" ").some((word) => word.startsWith(term))) best = Math.max(best, 90);
    else if (field.includes(term)) best = Math.max(best, 68);
    else if (term.length >= 3 && subsequenceMatch(term, field.replace(/\s/g, ""))) best = Math.max(best, 24);
  }
  return best;
}

export function rankCommands(commands, query) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return commands;

  const terms = normalizedQuery.split(" ").filter(Boolean);
  return commands
    .map((command, index) => {
      const isShortcutQuery = /^(ctrl|control|shift|alt|meta|cmd)\\b/.test(normalizedQuery);
      const fields = isShortcutQuery
        ? [normalize(command.shortcut)]
        : [
          normalize(command.label),
          normalize(command.description),
          normalize(command.category),
          normalize(command.shortcut),
          ...(command.keywords || []).map(normalize),
        ];
      const scores = terms.map((term) => scoreTerm(term, fields));
      if (scores.some((score) => score === 0)) return null;
      const label = normalize(command.label);
      const score = scores.reduce((total, value) => total + value, 0)
        + (label === normalizedQuery ? 40 : 0)
        + (label.startsWith(normalizedQuery) ? 20 : 0);
      return { command, index, score };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ command }) => command);
}
