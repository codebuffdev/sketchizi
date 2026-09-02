# Sketchizi

**Sketchizi** is a browser-based diagram and visual thinking tool built with React, Vite, and Excalidraw.

Create diagrams, flowcharts, system designs, architecture diagrams, and visual notes directly in your browser.

## Features

* 🎨 Excalidraw-powered drawing canvas
* 🧩 Large **Eraser icon library**
* 🔎 Icon search and Favorites
* 🕘 Recently Used icons
* 📦 Make Eraser icons available offline
* 💾 Local persistent canvas storage
* 📁 Recent Files for quickly reopening saved drawings
* 📄 Native `.excalidraw` file support
* 🌓 Light / Dark / System theme
* 📐 Layout controls
* 🗺️ Minimap
* ⌨️ Keyboard shortcuts
* 📱 Tablet and touch support
* 🧹 Clear canvas confirmation
* 💽 Emergency local backup when persistent storage fails
* 📱 PWA support

## Tech Stack

* **React**
* **Vite**
* **Excalidraw**
* **JavaScript**
* **CSS**
* **IndexedDB**
* **LocalStorage**
* **Service Worker / PWA**

## Getting Started

### Requirements

* Node.js
* npm

### Install

```bash
npm install
```

### Development

```bash
npm run dev
```

Open the local development URL shown by Vite.

### Production Build

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```text
sketchizi/
├── public/
│   └── ...
├── src/
│   ├── App.jsx
│   ├── IconLibraryPanel.jsx
│   ├── PropertiesPanel.jsx
│   ├── LayoutToolbar.jsx
│   ├── Minimap.jsx
│   ├── ShortcutHelp.jsx
│   ├── ErrorBoundary.jsx
│   ├── ThemeControl.jsx
│   ├── persistence.js
│   ├── eraserLibrary.js
│   └── ...
├── index.html
├── package.json
└── README.md
```

## Local Storage

Sketchizi keeps drawing data locally in the browser.

The main canvas uses **IndexedDB** for persistent storage, with an emergency LocalStorage backup mechanism for storage failures.

Recent drawings are stored separately so that clearing the current canvas does **not** remove your saved recent drawings.

## Eraser Icon Library

Sketchizi integrates the public Eraser icon catalog.

Icons can be:

* searched
* dragged onto the canvas
* favorited
* reused from Recently Used
* cached locally for offline use

The offline library uses browser caching so previously synchronized icons remain available without an internet connection.

## File Format

Sketchizi supports the standard:

```text
.excalidraw
```

format.

Drawings can therefore be exported and reopened using Excalidraw-compatible tools.

## Keyboard Shortcuts

| Shortcut    | Action                  |
| ----------- | ----------------------- |
| `/`         | Focus icon search       |
| `L`         | Toggle Library          |
| `P`         | Open Properties         |
| `D`         | Toggle Layout           |
| `Shift + G` | Toggle grid             |
| `M`         | Toggle Minimap          |
| `F`         | Toggle fullscreen       |
| `Esc`       | Close active panel      |
| `?`         | Show keyboard shortcuts |

Some shortcuts depend on the corresponding feature being enabled.

## Privacy

Sketchizi is designed around local-first browser storage.

Drawings and recent files are stored locally in the browser rather than requiring a Sketchizi account.

External resources, such as the Eraser icon catalog, may require an internet connection when icons have not yet been cached locally.

## Development

Clone the repository and install dependencies:

```bash
git clone https://github.com/codebuffdev/sketchizi.git
cd sketchizi
npm install
npm run dev
```


**Sketchizi — Draw • Connect • Visualize**
