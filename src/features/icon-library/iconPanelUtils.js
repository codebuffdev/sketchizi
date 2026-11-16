export const VIEW_MODE_STORAGE_KEY = "sketchizi:icon-panel-view-mode:v1";
export const SEARCH_STORAGE_KEY = "sketchizi:icon-library-recent-searches:v1";

export const SOURCE_TABS = [
  { id: "aws", label: "AWS", shortLabel: "AWS" },
  { id: "networking", label: "Networking", shortLabel: "Network" },
  { id: "kubernetes", label: "Kubernetes", shortLabel: "K8s" },
  { id: "mindmaps", label: "Mind Maps", shortLabel: "Mind Map" },
  { id: "uml", label: "UML", shortLabel: "UML" },
  { id: "eraser", label: "Essentials", shortLabel: "Essentials" },
  { id: "all", label: "All", shortLabel: "All" },
];

export const SCOPE_TABS = [
  { id: "all", label: "All" },
  { id: "favorites", label: "Saved" },
  { id: "recent", label: "Recent" },
];

export function sourceLabel(icon) {
  if (icon?.source === "aws" || icon?.catalog === "aws-architecture") return "AWS Architecture";
  if (icon?.source === "kubernetes" || icon?.category === "Kubernetes") return "Kubernetes";
  if (icon?.source === "networking" || icon?.category === "Networking") return "Networking";
  if (icon?.category === "Mind Maps" || icon?.source === "mindmap") return "Mind Maps";
  if (icon?.category === "UML Diagrams" || icon?.source === "uml") return "UML";
  return icon?.subtitle && icon.subtitle !== "Eraser" && icon.subtitle !== "Eraser Icons"
    ? icon.subtitle
    : "Essentials";
}

export function iconMetaLine(icon) {
  const source = sourceLabel(icon);
  const category = typeof icon?.category === "string" ? icon.category.trim() : "";
  if (
    category &&
    category !== source &&
    category !== "Eraser Icons" &&
    category !== "UML Diagrams" &&
    category !== "Mind Maps" &&
    category !== "Networking"
  ) {
    return `${source} · ${category}`;
  }
  return source;
}

export function normalizeSearchValue(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function iconSearchText(icon) {
  return [
    icon?.name,
    icon?.id,
    icon?.subtitle,
    icon?.category,
    icon?.source,
    icon?.catalog,
    ...(Array.isArray(icon?.searchAliases) ? icon.searchAliases : []),
    ...(Array.isArray(icon?.tags) ? icon.tags : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function scoreIconSearchMatch(icon, query) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return 0;

  const name = normalizeSearchValue(icon?.name);
  const id = normalizeSearchValue(icon?.id);
  const aliases = (Array.isArray(icon?.searchAliases) ? icon.searchAliases : []).map(normalizeSearchValue);
  const tags = (Array.isArray(icon?.tags) ? icon.tags : []).map(normalizeSearchValue);
  const words = name.split(" ");

  if (name === normalizedQuery) return 1000;
  if (id === normalizedQuery) return 950;
  if (aliases.includes(normalizedQuery)) return 900;
  if (name.startsWith(normalizedQuery)) return 850;
  if (words.includes(normalizedQuery)) return 825;
  if (words.some((word) => word.startsWith(normalizedQuery))) return 800;
  if (name.includes(normalizedQuery)) return 750;
  if (aliases.some((alias) => alias.startsWith(normalizedQuery))) return 700;
  if (aliases.some((alias) => alias.includes(normalizedQuery))) return 650;
  if (tags.some((tag) => tag === normalizedQuery)) return 600;
  if (tags.some((tag) => tag.includes(normalizedQuery))) return 500;

  const metadata = normalizeSearchValue(
    [icon?.subtitle, icon?.category, icon?.source, icon?.catalog].filter(Boolean).join(" "),
  );
  if (metadata.includes(normalizedQuery)) return 250;

  const queryWords = normalizedQuery.split(" ").filter(Boolean);
  const haystack = normalizeSearchValue(iconSearchText(icon));
  return queryWords.length && queryWords.every((word) => haystack.includes(word)) ? 100 : 0;
}

export function rankIconSearchResults(icons, query) {
  const list = Array.isArray(icons) ? icons : [];
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return list;
  return list
    .map((icon, index) => ({ icon, index, score: scoreIconSearchMatch(icon, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.icon);
}

export function getHighlightSegments(text, query) {
  if (typeof text !== "string") return [{ text: String(text || ""), match: false }];
  const q = String(query || "").trim();
  if (!q) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const index = lower.indexOf(q.toLowerCase());
  if (index === -1) return [{ text, match: false }];
  const segments = [];
  if (index > 0) segments.push({ text: text.slice(0, index), match: false });
  segments.push({ text: text.slice(index, index + q.length), match: true });
  if (index + q.length < text.length) segments.push({ text: text.slice(index + q.length), match: false });
  return segments;
}

export function iconSelectionKey(icon) {
  return `${icon?.source || icon?.catalog || "local"}:${icon?.category || ""}:${icon?.id || icon?.name || ""}`;
}

export function mixAllIcons(sources) {
  const seen = new Set();
  const mixed = [];
  const validSources = (Array.isArray(sources) ? sources : []).filter(Array.isArray);
  const longest = Math.max(0, ...validSources.map((source) => source.length));
  for (let index = 0; index < longest; index += 1) {
    for (const source of validSources) {
      const icon = source[index];
      if (!icon?.src) continue;
      const key = `${icon?.source || icon?.category || "local"}:${icon?.id || icon?.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mixed.push(icon);
    }
  }
  return mixed;
}

export function resolveDisplayedIcons({
  activeSource,
  search,
  allIcons,
  eraserCatalog,
  visibleIcons,
  favorites,
  recentIcons,
  awsIcons,
  activeAwsCategory,
  kubernetesIcons,
  activeKubernetesCategory,
  networkingIcons,
  umlIcons,
  mindMapIcons,
}) {
  const query = String(search || "").trim();
  if (activeSource === "favorites") return rankIconSearchResults(favorites, query);
  if (activeSource === "recent") return rankIconSearchResults(recentIcons, query);
  if (activeSource === "all") return rankIconSearchResults(allIcons, query);
  if (activeSource === "eraser") return rankIconSearchResults(eraserCatalog, query);

  if (activeSource === "aws") {
    const base =
      activeAwsCategory && activeAwsCategory !== "All"
        ? (awsIcons || []).filter((icon) => icon.category === activeAwsCategory)
        : awsIcons || visibleIcons;
    return query ? rankIconSearchResults(base, query) : base;
  }

  if (activeSource === "kubernetes") {
    const base =
      activeKubernetesCategory && activeKubernetesCategory !== "All"
        ? (kubernetesIcons || []).filter((icon) => icon.category === activeKubernetesCategory)
        : kubernetesIcons || visibleIcons;
    return query ? rankIconSearchResults(base, query) : base;
  }

  if (activeSource === "networking") {
    const base = networkingIcons?.length ? networkingIcons : visibleIcons;
    return query ? rankIconSearchResults(base, query) : base;
  }

  if (activeSource === "uml") {
    const base = umlIcons?.length ? umlIcons : visibleIcons;
    return query ? rankIconSearchResults(base, query) : base;
  }

  if (activeSource === "mindmaps") {
    const base = mindMapIcons?.length ? mindMapIcons : visibleIcons;
    return query ? rankIconSearchResults(base, query) : base;
  }

  return query ? rankIconSearchResults(visibleIcons, query) : visibleIcons;
}

export function getSubcategoryOptions({
  activeSource,
  awsCategories = [],
  awsCategoryCounts = {},
  kubernetesCategories = [],
  kubernetesCategoryCounts = {},
}) {
  if (activeSource === "aws" && awsCategories.length > 0) {
    return awsCategories.map((category) => ({
      value: category,
      label: category,
      count: awsCategoryCounts[category] || 0,
    }));
  }
  if (activeSource === "kubernetes" && kubernetesCategories.length > 0) {
    return kubernetesCategories.map((category) => ({
      value: category,
      label: category,
      count: kubernetesCategoryCounts[category] || 0,
    }));
  }
  return [];
}

export function getActiveCollectionTitle(activeSource) {
  switch (activeSource) {
    case "aws":
      return "AWS Architecture";
    case "kubernetes":
      return "Kubernetes";
    case "networking":
      return "Networking";
    case "mindmaps":
      return "Mind Maps";
    case "uml":
      return "UML Diagrams";
    case "eraser":
      return "Essentials";
    case "favorites":
      return "Saved Icons";
    case "recent":
      return "Recently Used";
    case "all":
    default:
      return "Icon Library";
  }
}

export function loadStoredViewMode() {
  try {
    const value = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
    return value === "list" || value === "grid" ? value : "list";
  } catch {
    return "list";
  }
}
