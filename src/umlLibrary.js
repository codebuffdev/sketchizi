// Built-in UML library. These are local, dependency-free SVG assets so UML
// elements are always available offline and use the same drag/insertion path
// as Eraser icons.

function svgData(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.trim())}`;
}

const stroke = '#1e1e1e';
const fill = '#ffffff';
const accent = '#5b55c7';

const ICONS = [
  {
    id: 'uml-class',
    name: 'Class',
    subtitle: 'UML',
    category: 'UML Diagrams',
    source: 'uml',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><rect x="7" y="7" width="106" height="76" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="3"/><path d="M7 31h106M7 56h106" stroke="${stroke}" stroke-width="3"/><text x="60" y="23" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="${stroke}">Class</text><text x="16" y="48" font-family="Arial,sans-serif" font-size="9" fill="${stroke}">+ field: Type</text><text x="16" y="72" font-family="Arial,sans-serif" font-size="9" fill="${stroke}">+ method()</text></svg>`,
  },
  {
    id: 'uml-abstract-class',
    name: 'Abstract Class',
    subtitle: 'UML',
    category: 'UML Diagrams',
    source: 'uml',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><rect x="7" y="7" width="106" height="76" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="3"/><path d="M7 31h106M7 56h106" stroke="${stroke}" stroke-width="3"/><text x="60" y="22" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-style="italic" font-weight="700" fill="${stroke}">Abstract</text><text x="16" y="48" font-family="Arial,sans-serif" font-size="9" fill="${stroke}"># field: Type</text><text x="16" y="72" font-family="Arial,sans-serif" font-size="9" font-style="italic" fill="${stroke}"># method()</text></svg>`,
  },
  {
    id: 'uml-interface',
    name: 'Interface',
    subtitle: 'UML',
    category: 'UML Diagrams',
    source: 'uml',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><rect x="7" y="7" width="106" height="76" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="3"/><path d="M7 34h106" stroke="${stroke}" stroke-width="3"/><text x="60" y="23" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="${accent}">&lt;&lt;interface&gt;&gt;</text><text x="60" y="51" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="${stroke}">Repository</text><text x="16" y="72" font-family="Arial,sans-serif" font-size="9" fill="${stroke}">+ save()</text></svg>`,
  },
  {
    id: 'uml-enum',
    name: 'Enumeration',
    subtitle: 'UML',
    category: 'UML Diagrams',
    source: 'uml',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><rect x="7" y="7" width="106" height="76" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="3"/><path d="M7 34h106" stroke="${stroke}" stroke-width="3"/><text x="60" y="23" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="${accent}">&lt;&lt;enum&gt;&gt;</text><text x="16" y="51" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="${stroke}">Status</text><text x="16" y="67" font-family="Arial,sans-serif" font-size="8" fill="${stroke}">ACTIVE</text><text x="65" y="67" font-family="Arial,sans-serif" font-size="8" fill="${stroke}">INACTIVE</text></svg>`,
  },
  {
    id: 'uml-package',
    name: 'Package',
    subtitle: 'UML',
    category: 'UML Diagrams',
    source: 'uml',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><path d="M9 25h36l7 9h59v48H9z" fill="${fill}" stroke="${stroke}" stroke-width="3"/><path d="M9 25h36l7 9" fill="none" stroke="${stroke}" stroke-width="3"/><text x="67" y="57" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="${stroke}">Package</text></svg>`,
  },
  {
    id: 'uml-actor',
    name: 'Actor',
    subtitle: 'UML',
    category: 'UML Diagrams',
    source: 'uml',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><circle cx="60" cy="17" r="9" fill="${fill}" stroke="${stroke}" stroke-width="3"/><path d="M60 26v25M42 38h36M60 51 47 74M60 51l13 23" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="60" y="87" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" font-weight="700" fill="${stroke}">Actor</text></svg>`,
  },
  {
    id: 'uml-use-case',
    name: 'Use Case',
    subtitle: 'UML',
    category: 'UML Diagrams',
    source: 'uml',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><ellipse cx="60" cy="42" rx="45" ry="27" fill="${fill}" stroke="${stroke}" stroke-width="3"/><text x="60" y="46" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="${stroke}">Use Case</text></svg>`,
  },
  {
    id: 'uml-component',
    name: 'Component',
    subtitle: 'UML',
    category: 'UML Diagrams',
    source: 'uml',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><rect x="14" y="14" width="92" height="62" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="3"/><path d="M24 27h13v8H24zM24 41h13v8H24zM24 55h13v8H24z" fill="${fill}" stroke="${stroke}" stroke-width="2"/><text x="72" y="49" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="700" fill="${stroke}">Component</text></svg>`,
  },
  {
    id: 'uml-node',
    name: 'Node',
    subtitle: 'UML',
    category: 'UML Diagrams',
    source: 'uml',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><path d="M19 28h65l17 17v25H36L19 53z" fill="${fill}" stroke="${stroke}" stroke-width="3"/><path d="M84 28v17h17" fill="none" stroke="${stroke}" stroke-width="3"/><text x="59" y="59" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="${stroke}">Node</text></svg>`,
  },
  {
    id: 'uml-note',
    name: 'Note',
    subtitle: 'UML',
    category: 'UML Diagrams',
    source: 'uml',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><path d="M20 10h70l14 14v56H20z" fill="${fill}" stroke="${stroke}" stroke-width="3"/><path d="M90 10v14h14" fill="none" stroke="${stroke}" stroke-width="3"/><text x="60" y="48" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="700" fill="${stroke}">Note</text><path d="M39 61h42M39 69h30" stroke="${stroke}" stroke-width="2" stroke-linecap="round"/></svg>`,
  },
  {
    id: 'uml-association',
    name: 'Association',
    subtitle: 'UML Relation',
    category: 'UML Diagrams',
    source: 'uml',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><rect x="7" y="31" width="28" height="28" fill="${fill}" stroke="${stroke}" stroke-width="3"/><rect x="85" y="31" width="28" height="28" fill="${fill}" stroke="${stroke}" stroke-width="3"/><path d="M35 45h50" stroke="${stroke}" stroke-width="3"/></svg>`,
  },
  {
    id: 'uml-generalization',
    name: 'Generalization',
    subtitle: 'UML Relation',
    category: 'UML Diagrams',
    source: 'uml',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><rect x="7" y="56" width="28" height="24" fill="${fill}" stroke="${stroke}" stroke-width="3"/><rect x="85" y="10" width="28" height="24" fill="${fill}" stroke="${stroke}" stroke-width="3"/><path d="M35 56 82 34M82 34 73 34M82 34 78 42" fill="none" stroke="${stroke}" stroke-width="3"/><path d="M82 34 73 25" fill="none" stroke="${stroke}" stroke-width="3"/><path d="M82 34 73 34 78 42Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/></svg>`,
  },
  {
    id: 'uml-realization',
    name: 'Realization',
    subtitle: 'UML Relation',
    category: 'UML Diagrams',
    source: 'uml',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><rect x="7" y="56" width="28" height="24" fill="${fill}" stroke="${stroke}" stroke-width="3"/><rect x="85" y="10" width="28" height="24" fill="${fill}" stroke="${stroke}" stroke-width="3"/><path d="M35 56 84 34" stroke="${stroke}" stroke-width="3" stroke-dasharray="7 5"/><path d="M84 34 73 28M84 34 77 43" fill="none" stroke="${stroke}" stroke-width="3"/><path d="M84 34 73 25 77 43Z" fill="${fill}" stroke="${stroke}" stroke-width="2"/></svg>`,
  },
  {
    id: 'uml-aggregation',
    name: 'Aggregation',
    subtitle: 'UML Relation',
    category: 'UML Diagrams',
    source: 'uml',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><rect x="7" y="31" width="28" height="28" fill="${fill}" stroke="${stroke}" stroke-width="3"/><rect x="85" y="31" width="28" height="28" fill="${fill}" stroke="${stroke}" stroke-width="3"/><path d="M35 45h40" stroke="${stroke}" stroke-width="3"/><path d="m75 45 10-8 10 8-10 8z" fill="${fill}" stroke="${stroke}" stroke-width="3"/></svg>`,
  },
  {
    id: 'uml-composition',
    name: 'Composition',
    subtitle: 'UML Relation',
    category: 'UML Diagrams',
    source: 'uml',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 90"><rect x="7" y="31" width="28" height="28" fill="${fill}" stroke="${stroke}" stroke-width="3"/><rect x="85" y="31" width="28" height="28" fill="${fill}" stroke="${stroke}" stroke-width="3"/><path d="M35 45h40" stroke="${stroke}" stroke-width="3"/><path d="m75 45 10-8 10 8-10 8z" fill="${stroke}"/></svg>`,
  },
];

export const umlIcons = ICONS.map(({ svg, ...icon }) => ({
  ...icon,
  src: svgData(svg),
}));
