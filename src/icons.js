import { icons as legacyIcons } from "./legacyIcons";

export const categories = [
  "AWS Services",
  "Azure Services",
  "GCP Services",
  "Databases",
  "Networking",
  "Kubernetes",
  "Programming",
  "Architecture",
  "Tech Logos",
  "General Icons",
];

// Fast, local starting set. The full library is loaded on demand from
// open-source Iconify collections so the app does not ship a multi-megabyte
// icon bundle.
export const featuredIcons = legacyIcons.map((icon) => ({
  ...icon,
  source: "local",
}));

export const remoteCategories = {
  "AWS Services": { search: "aws-", fallbackSearch: "aws" },
  "Azure Services": { search: "azure-", fallbackSearch: "azure" },
  "GCP Services": { collection: "gcp" },
  Kubernetes: { collection: "kubernetes" },
  Programming: { collection: "devicon" },
  "Tech Logos": { collection: "simple-icons" },
  "General Icons": { collection: "mdi" },
  Databases: { search: "database" },
  Networking: { search: "network" },
  Architecture: { search: "architecture" },
};

export const iconifyUrl = (iconName) => {
  const [prefix, ...rest] = iconName.split(":");
  const name = rest.join(":");
  return `https://api.iconify.design/${encodeURIComponent(prefix)}/${encodeURIComponent(name)}.svg`;
};

export const toRemoteIcon = (iconName, category = "Tech Logos") => {
  const [prefix, ...rest] = iconName.split(":");
  const name = rest.join(":");
  const readable = name
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  return {
    id: iconName,
    name: readable,
    subtitle: prefix,
    category,
    src: iconifyUrl(iconName),
    source: "iconify",
    iconName,
  };
};
