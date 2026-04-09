<div align="center">

# 🔍 EDS QA Helper

**Visual audit & responsive QA tool for Adobe Experience Manager Edge Delivery Services**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![AEM EDS](https://img.shields.io/badge/AEM-Edge%20Delivery%20Services-eb1000.svg)](https://www.aem.live/)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension%20MV3-4285F4.svg)](#chrome-extension)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

A lightweight QA tool built for AEM EDS/Franklin developers. Detect layout inconsistencies, broken links, accessibility issues, and responsive breakpoints — available as a **Chrome Extension** or a **paste-and-run script**.

[Features](#features) · [Chrome Extension](#chrome-extension) · [Script Usage](#script-usage) · [How It Works](#how-it-works) · [Contributing](#contributing)

</div>

---

## Why This Exists

AEM Edge Delivery Services developers constantly switch between Figma, localhost, preview, and live environments to validate blocks. The typical QA workflow involves manually resizing the browser, eyeballing spacing, checking links one by one, and comparing screenshots side-by-side.

**EDS QA Helper automates this entire flow** — it understands AEM EDS DOM structure (`.block`, `.section`, wrappers) and runs directly inside the page you're building.

---

## Features

### 🎨 Figma Design Comparison
Compare your live page against Figma designs.
- **API Mode**: Paste a Figma URL + token → automated token extraction and comparison
- **JSON Mode**: Run a curl command and paste the response (fallback when API is not available)
- **Screenshot Mode**: Drag & drop a screenshot for pixel-diff comparison
- Compares: dimensions, spacing, typography, colors, borders, flex layout
- **8px Grid audit** on all spacing values
- Names issues by UI/UX principle: *Type Scale*, *Visual Hierarchy*, *Vertical Rhythm*, *Spacing Scale*
- Smart component matching: Figma frames → AEM EDS blocks

> **Chrome Extension bonus**: Figma API works without CORS issues — the background service worker proxies all requests. Token is persisted across sessions.

### 🔗 Link & Accessibility Auditor
- Validates internal links via `HEAD` request (detects 404s)
- Flags images with missing or empty `alt` attributes
- Handles: `mailto:`, `tel:`, hash anchors, `javascript:void(0)`, empty hrefs
- Click any issue → auto-scroll to the element

### 📱 Responsive Breakpoint Analyzer
- Analyzes current viewport or all 3 breakpoints (375px · 768px · 1440px) via hidden iframes
- Detects: horizontal overflow, block overlap, image distortion, collapsed containers, text wrapping issues
- Filters false positives: `overflow:hidden` ancestors, hidden elements, sub-pixel tolerance

### 🧱 AEM EDS Inspector
- Lists all `.block` and `.section` elements with dimensions
- Identifies environment: Preview, Live, Localhost, AEM Preview/Live
- Shows page metadata (`og:title`, `description`)

---

## Chrome Extension

### Install (Developer Mode)

1. Clone or download this repository
2. In Chrome, go to `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **"Load unpacked"**
5. Select the `extension/` folder from this repo
6. The icon appears in the toolbar

### Usage

- Navigate to any AEM EDS page (preview, localhost, or live)
- Click the extension icon → see environment info
- Click **"Activate"** → QA Helper panel appears on the page
- Or use the shortcut **Ctrl+Shift+Q** (Cmd+Shift+Q on Mac)
- Click **"Deactivate"** to remove

### Why Use the Extension?

| Feature | Script (console paste) | Chrome Extension |
|---|---|---|
| Setup | Paste every page load | Install once |
| Figma API | Blocked by CORS | **Works natively** |
| Figma Token | Lost on reload | **Persisted** |
| Keyboard shortcut | None | **Ctrl+Shift+Q** |
| Status indicator | None | **Badge "ON"** |
| Environment detection | Manual | **Automatic** |

---

## Script Usage

If you prefer not to install the extension, the standalone script works in any browser console.

### Paste in Console

1. Open your AEM EDS page
2. Open DevTools → Console (F12)
3. Paste the contents of [`src/qa-helper.js`](src/qa-helper.js) and press Enter

### Bookmarklet

```
javascript:void(fetch('http://localhost:3000/tools/qa-helper.js').then(r=>r.text()).then(eval))
```

### Tampermonkey

```js
// ==UserScript==
// @name         EDS QA Helper
// @match        *://*.hlx.page/*
// @match        *://*.hlx.live/*
// @match        *://*.aem.page/*
// @match        *://*.aem.live/*
// @match        http://localhost:3000/*
// @grant        none
// ==/UserScript==
// Paste src/qa-helper.js contents here
```

---

## How It Works

```
eds-qa-helper/
│
├── extension/                  ← Chrome Extension (Manifest V3)
│   ├── manifest.json           
│   ├── background/
│   │   └── service-worker.js   # Figma API proxy, injection, state
│   ├── content/
│   │   └── qa-helper.js        # The tool (auto-detects extension context)
│   ├── popup/
│   │   ├── popup.html          # Extension popup UI
│   │   ├── popup.css
│   │   └── popup.js            # Toggle, status, token management
│   └── icons/
│
├── src/
│   └── qa-helper.js            # Standalone version (paste in console)
│
└── tests/
    └── edge-cases.html         # 60+ tests with automated runner
```

### Architecture

```
┌──────────────────────────────────────────────┐
│  Chrome Extension (background service worker) │
│  ┌──────────────────────────────────────────┐ │
│  │  Figma API Proxy (no CORS)              │ │
│  │  Token Persistence (chrome.storage)      │ │
│  │  Tab State Management                   │ │
│  │  Keyboard Shortcut Handler              │ │
│  └──────────────────────────────────────────┘ │
└──────────┬───────────────────────────────────┘
           │ chrome.runtime.sendMessage
┌──────────▼───────────────────────────────────┐
│  Content Script / Injected (qa-helper.js)     │
│  ┌────────────────────────────────────┐       │
│  │ Shadow DOM Panel (5 tabs)          │       │
│  │  🎨 Figma Design Comparator       │       │
│  │  🔍 Visual Screenshot Diff        │       │
│  │  🔗 Link & A11y Auditor           │       │
│  │  📱 Responsive Analyzer           │       │
│  │  🧱 EDS Inspector                 │       │
│  ├────────────────────────────────────┤       │
│  │ Highlight Engine (page overlays)   │       │
│  └────────────────────────────────────┘       │
└──────────────────────────────────────────────┘
```

### Design Principles Checked

| Principle | What It Validates |
|---|---|
| **8px Grid System** | Spacing values are multiples of 4/8 |
| **Type Scale** | Font size, letter-spacing match the design |
| **Visual Hierarchy** | Font weight matches intended emphasis |
| **Vertical Rhythm** | Line-height consistency |
| **Color System** | Background, text, border colors match tokens |
| **Structural Pattern** | Flex direction matches Figma auto-layout |
| **Alignment System** | justify-content, align-items match design |
| **Atomic Design** | Component presence — Figma → DOM |

---

## Testing

1. Open `tests/edge-cases.html` in Chrome
2. (Optional) Paste `src/qa-helper.js` in console for lifecycle tests
3. Click **"▶ Run Tests"** in the banner
4. Console shows results — 60+ assertions covering:
   - Link & alt-text edge cases (19 tests)
   - Responsive detection (12 tests)
   - Figma analyzer: URL parsing, color conversion, name matching, grid audit (24 tests)
   - EDS inspector (5 tests)
   - UI lifecycle (4 tests)
   - Known bug regression tests (5 tests)

---

## Compatibility

| Environment | Status |
|---|---|
| AEM EDS Preview (`.hlx.page` / `.aem.page`) | ✅ |
| AEM EDS Live (`.hlx.live` / `.aem.live`) | ✅ |
| Localhost (`aem up` / `hlx up`) | ✅ |
| Chrome 90+ | ✅ |
| Firefox 90+ | ✅ (script only, no extension) |
| Safari 15+ | ⚠️ Script only, clipboard limited |

---

## Roadmap

- [ ] Snapshot regression: save baseline tokens, detect regressions over time
- [ ] Auto CSS fix generator: copy-paste ready selectors
- [ ] Pre-merge checklist: per-block QA report for PRs
- [ ] AEM CLI integration: auto-rerun on hot reload
- [ ] Preview vs Localhost diff: side-by-side comparison
- [ ] xwalk → DOM mapping: trace Universal Editor fields to rendered elements
- [ ] Chrome Web Store publication

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). This tool was born from real AEM EDS workflow frustration — if something bugs you, open an issue.

---

## License

[MIT](LICENSE)

---

<div align="center">

Built for the AEM EDS community 🧱

</div>
