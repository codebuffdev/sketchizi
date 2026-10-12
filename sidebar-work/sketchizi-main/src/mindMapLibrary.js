// Built-in Mind Map library. Local, dependency-free SVG assets so mind-map
// building blocks are always available offline and use the same drag/insertion
// path as Eraser and UML icons.

function svgData(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

const stroke = '#1e1e1e';
const fill = '#ffffff';
const accent = '#5b55c7';
const soft = '#f6f4ff';

const ICONS = [
  {
    id: 'mind-central-topic',
    name: 'Central Topic',
    subtitle: 'Mind Map',
    category: 'Mind Maps',
    source: 'mindmap',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 90"><rect x="12" y="18" width="116" height="54" rx="16" fill="${soft}" stroke="${accent}" stroke-width="3"/><text x="70" y="51" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" font-weight="700" fill="${stroke}">Central Topic</text></svg>`,
  },
  {
    id: 'mind-main-topic',
    name: 'Main Topic',
    subtitle: 'Mind Map',
    category: 'Mind Maps',
    source: 'mindmap',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 90"><rect x="18" y="22" width="104" height="46" rx="12" fill="#ffffff" stroke="${accent}" stroke-width="3"/><circle cx="28" cy="45" r="4" fill="${accent}"/><text x="74" y="50" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="${stroke}">Main Topic</text></svg>`,
  },
  {
    id: 'mind-subtopic',
    name: 'Subtopic',
    subtitle: 'Mind Map',
    category: 'Mind Maps',
    source: 'mindmap',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 90"><rect x="24" y="25" width="92" height="40" rx="10" fill="#ffffff" stroke="${stroke}" stroke-width="3"/><text x="70" y="49" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="${stroke}">Subtopic</text></svg>`,
  },
  {
    id: 'mind-floating-topic',
    name: 'Floating Topic',
    subtitle: 'Mind Map',
    category: 'Mind Maps',
    source: 'mindmap',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 90"><rect x="20" y="21" width="100" height="48" rx="8" fill="#ffffff" stroke="${stroke}" stroke-width="3" stroke-dasharray="7 5"/><text x="70" y="50" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="${stroke}">Floating Topic</text></svg>`,
  },
  {
    id: 'mind-summary',
    name: 'Summary',
    subtitle: 'Mind Map',
    category: 'Mind Maps',
    source: 'mindmap',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 90"><path d="M20 22h86l14 23-14 23H20l10-23z" fill="${soft}" stroke="${accent}" stroke-width="3"/><text x="68" y="50" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="${stroke}">Summary</text></svg>`,
  },
  {
    id: 'mind-boundary',
    name: 'Boundary',
    subtitle: 'Mind Map',
    category: 'Mind Maps',
    source: 'mindmap',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 90"><rect x="12" y="12" width="116" height="66" rx="16" fill="none" stroke="${accent}" stroke-width="3" stroke-dasharray="8 5"/><text x="70" y="51" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="${accent}">Boundary</text></svg>`,
  },
  {
    id: 'mind-relationship',
    name: 'Relationship',
    subtitle: 'Mind Map',
    category: 'Mind Maps',
    source: 'mindmap',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 90"><rect x="8" y="29" width="30" height="30" rx="8" fill="#ffffff" stroke="${stroke}" stroke-width="3"/><rect x="102" y="29" width="30" height="30" rx="8" fill="#ffffff" stroke="${stroke}" stroke-width="3"/><path d="M38 44c18-18 46-18 64 0" fill="none" stroke="${accent}" stroke-width="3"/><path d="M96 38l7 6-8 4" fill="none" stroke="${accent}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    id: 'mind-branch',
    name: 'Branch',
    subtitle: 'Mind Map',
    category: 'Mind Maps',
    source: 'mindmap',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 90"><circle cx="22" cy="45" r="7" fill="${accent}"/><path d="M29 45h39M68 45c18 0 18-25 36-25M68 45c18 0 18 25 36 25" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round"/><circle cx="108" cy="20" r="6" fill="#ffffff" stroke="${accent}" stroke-width="3"/><circle cx="108" cy="70" r="6" fill="#ffffff" stroke="${accent}" stroke-width="3"/></svg>`,
  },
  {
    id: 'mind-callout',
    name: 'Callout',
    subtitle: 'Mind Map',
    category: 'Mind Maps',
    source: 'mindmap',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 90"><path d="M16 18h108a7 7 0 0 1 7 7v32a7 7 0 0 1-7 7H63L47 77v-13H16a7 7 0 0 1-7-7V25a7 7 0 0 1 7-7z" fill="#ffffff" stroke="${accent}" stroke-width="3"/><text x="70" y="47" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="${stroke}">Callout</text></svg>`,
  },
];

export const mindMapIcons = ICONS.map(({ svg, ...icon }) => ({
  ...icon,
  src: svgData(svg),
}));
