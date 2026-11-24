const ICONS = {
  canvas: {
    strokeWidth: 1.95,
    paths: ['<path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z" />'],
  },
  pages: {
    strokeWidth: 1.9,
    paths: [
      '<path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" />',
      '<path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" />',
    ],
  },
  'system-design': {
    strokeWidth: 1.9,
    paths: [
      '<rect x="2" y="3" width="7" height="7" rx="1.5" />',
      '<rect x="15" y="14" width="7" height="7" rx="1.5" />',
      '<path d="M9 6.5h4.5a2 2 0 0 1 2 2V14" />',
    ],
  },
};

export function getWorkspaceModeIconMarkup(mode, className = '') {
  const icon = ICONS[mode] || ICONS.canvas;
  const modeClass = mode === 'system-design' ? 'system-design' : mode;
  return `<svg class="workspace-mode-icon workspace-mode-icon--${modeClass} ${className}" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${icon.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.paths.join('')}</svg>`;
}

export default function WorkspaceModeIcon({ mode = 'canvas', className = '' }) {
  const icon = ICONS[mode] || ICONS.canvas;
  return (
    <svg
      className={`workspace-mode-icon workspace-mode-icon--${mode} ${className}`.trim()}
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={icon.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {mode === 'canvas' && <path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z" />}
      {mode === 'pages' && <>
        <path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" />
        <path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" />
      </>}
      {mode === 'system-design' && <>
        <rect x="2" y="3" width="7" height="7" rx="1.5" />
        <rect x="15" y="14" width="7" height="7" rx="1.5" />
        <path d="M9 6.5h4.5a2 2 0 0 1 2 2V14" />
      </>}
    </svg>
  );
}

export function getWorkspaceTabMode(tab) {
  if (tab?.type === "pages" || tab?.type === "page") return "pages";
  if (tab?.type === "system-design" || tab?.snapshot?.systemDesign?.active === true) return "system-design";
  if (tab?.type === "canvas") return "canvas";
  if ((Array.isArray(tab?.chapters) && tab.chapters.length > 0) ||
      (Array.isArray(tab?.snapshot?.chapters) && tab.snapshot.chapters.length > 0) ||
      (Array.isArray(tab?.snapshot?.elements) && tab.snapshot.elements.some(element =>
        element?.type === "frame" && element.customData?.sketchiziPage && !element.isDeleted))) return "pages";
  return "canvas";
}
