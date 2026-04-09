# Architecture

## Overview

EDS QA Helper is a **single-file, zero-dependency, injectable JavaScript tool** that runs inside AEM EDS pages.

It uses Shadow DOM for CSS isolation, injects visual overlays on the host page, and provides a tabbed panel for different QA operations.

## Module Map

```
qa-helper.js (IIFE)
│
├── Constants
│   ├── BREAKPOINTS { mobile: 375, tablet: 768, desktop: 1440 }
│   └── COLORS { error, warning, success, info }
│
├── Utilities
│   ├── $() / $$()         — querySelector wrappers
│   ├── createEl()         — DOM element factory
│   └── uid()              — random ID generator
│
├── Highlight Engine
│   ├── highlightElement() — creates fixed overlay on element
│   └── clearHighlights()  — removes all overlays
│
├── Module 1: linkAuditor
│   └── run()              — async, collects <a>/<img>, validates
│
├── Module 2: responsiveAnalyzer
│   ├── analyzeCurrentViewport()  — checks current window
│   ├── analyzeAllBreakpoints()   — spawns 3 iframes
│   ├── analyzeViaIframe()        — single iframe analysis
│   └── isClippedByAncestor()     — overflow:hidden filter
│
├── Module 3: visualComparator
│   ├── loadHtml2Canvas()    — CDN lazy load
│   ├── captureElement()     — renders element to canvas
│   ├── diffCanvases()       — pixel-by-pixel comparison
│   └── startPicker()        — interactive element selector
│
├── Module 4: edsInspector
│   ├── getBlocks()    — lists .block elements
│   ├── getSections()  — lists .section elements
│   └── getMetadata()  — reads <meta> tags
│
├── Module 5: figmaAnalyzer
│   ├── parseUrl()              — Figma URL → fileKey + nodeId
│   ├── apiFetch()              — authenticated Figma REST API
│   ├── fetchNode() / fetchImage()
│   ├── figmaColorToRGB()       — 0-1 float → 0-255 int
│   ├── parseCSSColor()         — "rgb(...)" → {r,g,b}
│   ├── colorDistance()         — Euclidean RGB distance
│   ├── extractFigmaTokens()    — Figma node → design tokens
│   ├── extractDOMTokens()      — DOM element → design tokens
│   ├── matchComponents()       — Figma ↔ DOM pairing
│   ├── compare()               — token-by-token diff
│   ├── audit8pxGrid()          — spacing grid compliance
│   ├── analyzePage()           — full API flow
│   └── analyzeFromJSON()       — CORS fallback flow
│
└── UI: buildUI()
    ├── Shadow DOM + style injection
    ├── Draggable header
    ├── Tab system (5 tabs)
    ├── renderFigmaTab()        — with JSON paste fallback
    ├── renderVisualTab()
    ├── renderLinksTab() + renderLinkResults()
    ├── renderResponsiveTab() + renderResponsiveResults()
    ├── renderInspectTab()
    └── destroy()               — cleanup on double-ESC
```

## Key Design Decisions

### Why a single file?
AEM EDS developers need to paste-and-run. No npm install, no build step, no server. The tool must work in any environment with zero setup.

### Why Shadow DOM?
AEM EDS pages have their own CSS (styles.css, block CSS). Without Shadow DOM, the tool's styles would conflict with the page. Shadow DOM provides complete isolation in both directions.

### Why not a Chrome Extension?
Chrome Web Store review takes days/weeks. The tool needs to iterate fast and work across different browser contexts. A paste-able script has zero friction.

### Why html2canvas on-demand?
It's ~200KB. Loading it eagerly would add latency to every injection. Most sessions only use 1-2 tabs, so lazy loading is the right trade-off.

### Why iframe-based breakpoint analysis?
Resizing the actual viewport would disrupt the developer's workflow. Hidden iframes at target widths allow non-destructive multi-breakpoint testing.

## Tolerances

| Check | Tolerance | Reason |
|---|---|---|
| Overflow detection | 2px | Sub-pixel rendering, border rounding |
| Color distance | 25 (Euclidean RGB) | Screen calibration, compression artifacts |
| Font size | 1px | rem/em rounding |
| Spacing | 4px | Different box-model interpretations |
| Dimension | 8px | Dynamic content, scrollbar presence |
| Image distortion ratio | 0.1 | Minor rounding in aspect-ratio calc |
| Border radius | 2px | Sub-pixel rounding |
