/**
 * Selector catalogue, derived from the real components (not guessed):
 *  PrimaryDock.jsx, ToolOptionsDock.jsx, ContextualFormattingToolbar.jsx,
 *  CanvasTabs.jsx, MapDock.jsx, CanvasMapRadar.jsx, CanvasZoomControl.jsx,
 *  IconLibraryPanel.jsx, PropertiesPanel.jsx, AiAskPanel.jsx,
 *  ArchitectureValidationPanel.jsx, pages/*, design/ui/*, Collaboration*.jsx,
 *  ExportStudioModal.jsx.
 * Values are CSS selector lists (comma separated = any of).
 */
export const SEL = {
  app: ".app",
  startupChooser: ".startup-canvas-chooser",
  startupOption: ".startup-canvas-option",
  canvasHost: "main.canvas, .canvas",
  excalidraw: ".excalidraw",
  canvasEl: ".excalidraw canvas.interactive, .excalidraw .excalidraw__canvas",
  header: ".desktop-app-header, header",
  headerIslands: ".desktop-app-header-island",

  primaryDock: ".sketchizi-tool-sidebar",
  primaryDockToggle: ".sketchizi-tool-sidebar-active",
  primaryDockCollapse: ".sketchizi-tool-sidebar-expand",
  primaryDockChildRail: ".sketchizi-tool-sidebar-child-rail",
  primaryDockButton: ".sketchizi-tool-sidebar-list .sketchizi-tool-sidebar-button",

  toolOptionsDock: ".sketchizi-tool-options-dock",
  contextualToolbar: ".contextual-formatting-toolbar",
  contextualPopovers: ".format-options-popover, .sk-tool-choice-menu, .sk-tool-align-popover, .sk-tool-layer-menu, .sk-tool-opacity-popover",
  toolChoiceTrigger: ".sk-tool-choice-trigger",
  alignTrigger: ".sk-tool-align-trigger",
  layerTrigger: ".sk-tool-layer-trigger",
  colorControl: ".sk-tool-color-control, .format-custom-color",
  formattingOptionsButton: "button[aria-label='Formatting options']",

  tabsBar: ".canvas-tabs-bar",
  tabsList: ".canvas-tabs-list",
  tab: ".canvas-tab-item [role=tab]",
  tabItem: ".canvas-tab-item",
  tabReady: ".canvas-tab.is-active .canvas-tab-status-dot, .canvas-tab-item.is-active",
  tabAdd: ".canvas-tabs-add",
  tabClose: ".canvas-tab-close",
  tabOverflowTrigger: ".canvas-tabs-overflow-trigger",
  tabOverflowMenu: ".canvas-tabs-overflow-menu",
  tabCreateMenu: ".canvas-tabs-create-menu",
  tabCreateOption: ".canvas-tabs-create-option",
  tabInlineRename: ".canvas-tab-inline-rename",

  iconToggle: "button[aria-label='Open icon library'], button[aria-label='Close icon library'].library-toggle",
  iconPanel: ".library-panel",
  iconSearch: ".library-panel input.search, .library-panel input[aria-label^='Search icons']",
  iconResults: ".library-panel .icons, .library-panel [aria-label='Icon results']",
  iconCard: ".library-panel .sk-icon-card-main, .library-panel .library-icon-card-content",
  iconAddButton: ".library-add-icon",
  iconClose: "button[aria-label='Close icon library']",

  propertiesPanel: ".properties-panel",
  propertiesClose: ".properties-close, button[aria-label='Close properties']",
  propertiesOpenFromDock: "button[aria-label='Open properties drawer']",

  minimap: ".sk-map-popover",
  zoomControl: ".desktop-app-zoom-control",

  aiToggle: ".ai-ask-toggle",
  aiPanel: ".ai-ask-panel",
  aiMessages: ".ai-ask-messages",
  aiComposer: ".ai-ask-composer",
  aiTextarea: "#ai-ask-question",
  aiProvider: "#ai-ask-provider",
  aiProviderSummary: ".ai-ask-provider-summary",
  aiSubmit: ".ai-ask-composer button[type=submit]",
  aiClose: "button[aria-label='Close AI Ask']",

  validationPanel: ".architecture-validation-panel",
  validationClose: "button[aria-label='Close architecture validation']",

  pagesWorkspace: ".pages-book-workspace",
  pagesSurface: ".canvas-pages-page-surface",
  pagesChapterTrigger: ".canvas-pages-chapter-trigger",
  pagesChapterPopover: ".canvas-pages-chapter-popover",
  pagesAddChapter: "button[aria-label='Add Chapter'], .canvas-pages-add, .canvas-pages-chapter-new",
  pagesChapterRemove: ".canvas-pages-chapter-remove, .canvas-pages-delete",
  pagesDeleteConfirm: ".pages-delete-confirm-dialog",
  pagesDeleteSubmit: ".pages-delete-confirm-submit",
  pagesNext: "button[aria-label='Next chapter']",
  pagesPrev: "button[aria-label='Previous chapter']",
  pagesTitle: "[aria-label='Chapter title'], .pages-book-title-input",

  designScreen: ".design-studio-screen",
  designSearch: "input[aria-label='Search templates']",
  designCategories: "[aria-label='Template categories']",
  designTemplates: "[aria-label='Design templates']",
  designSelectedActions: "[aria-label='Selected template actions']",
  designDialog: ".design-dialog",

  collabShare: ".collaboration-share-panel, [aria-label='Share collaboration']",
  collabControls: "[aria-label='Collaboration controls']",
  collabParticipants: "[aria-label='Collaboration participants'], [aria-label='Participants']",
  collabChat: ".collaboration-chat-panel",
  collabStatus: ".collaboration-header-status",
  collabRecovery: "[aria-label='Close recovery']",

  exportModal: ".sketchizi-export-modal",
  exportBody: ".sketchizi-export-body",
  exportClose: "button[aria-label='Close export studio']",
  exportPill: ".sketchizi-export-pill-row button",
  exportPreview: ".sketchizi-system-export-preview",

  commandPalette: ".sketchizi-command-palette",
  moreToolsMenu: ".sketchizi-more-tools-menu",
  systemDesignStudio: "[data-testid='system-design-studio']",
};

/** Floating surfaces whose mutual overlap is checked. */
export const FLOATING_SURFACES = [
  { name: "header-island", selector: ".desktop-app-header-island" },
  { name: "tabs-bar", selector: ".canvas-tabs-bar" },
  { name: "primary-dock", selector: ".sketchizi-tool-sidebar" },
  { name: "contextual-dock", selector: ".sketchizi-tool-options-dock.is-open, .contextual-formatting-toolbar" },
  { name: "minimap", selector: ".sk-map-popover" },
  { name: "zoom-controls", selector: ".desktop-app-zoom-wrap" },
  { name: "properties-toggle", selector: ".properties-toggle" },
  { name: "properties-panel", selector: ".properties-panel" },
  { name: "library-panel", selector: ".library-panel" },
  { name: "ai-panel", selector: ".ai-ask-panel:not([aria-hidden='true'])" },
  { name: "validation-panel", selector: ".architecture-validation-panel" },
  { name: "collab-chat", selector: ".collaboration-chat-panel" },
  { name: "tab-menus", selector: ".canvas-tabs-overflow-menu, .canvas-tabs-create-menu, .canvas-tabs-closed-menu" },
];

/** Interactive elements for clipping / touch-target checks. */
export const INTERACTIVE_SELECTOR =
  "button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=menuitem], [role=switch]";
