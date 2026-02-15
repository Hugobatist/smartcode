# Phase 9: Foundation Refactoring - Research

**Researched:** 2026-02-15
**Domain:** Frontend architecture refactoring — monolithic HTML to modular vanilla JS
**Confidence:** HIGH

## Summary

Phase 9 is a structural refactoring of `static/live.html` (1757 lines) into modular vanilla JavaScript files connected via an event bus, with a DiagramDOM abstraction layer that decouples all Mermaid-specific SVG queries. The current codebase already has partial modularity — five external `.js` files exist (`annotations.js`, `collapse-ui.js`, `search.js`, `diagram-editor.js`, `ws-client.js`) — but `live.html` still contains 956 lines of inline JavaScript, 571 lines of inline CSS, and 97 lines of initialization code. Modules communicate through `window.*` globals and direct function references passed via hook objects.

The refactoring is a prerequisite for all subsequent v2.0 phases (custom renderer, canvas interactions, AI observability). The strangler fig pattern applies perfectly: extract one concern at a time from `live.html` into external modules, verify tests pass, then repeat. No new dependencies are needed — this is pure structural reorganization using vanilla JS IIFEs (the project's established module pattern for browser code, since `static/` files are served raw without a bundler).

**Primary recommendation:** Extract inline JS into 7-8 focused modules (event-bus, renderer, pan-zoom, file-tree, export, editor-panel, app-init), extract CSS into `main.css`, build a 50-method DiagramDOM abstraction, and wire everything through an event bus — all using the existing IIFE pattern (not ES modules, since static files are served unbundled).

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vanilla JS (IIFE) | ES2020+ | Module pattern | Project convention — `static/` has no bundler |
| Mermaid | v11 (CDN) | Diagram rendering | Already in use, remains the renderer for Phase 9 |
| No new deps | - | - | Zero-dependency phase — pure refactoring |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| EventTarget API | Built-in | Event bus backbone | Native browser API, zero overhead |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| IIFE modules | ES modules (`type="module"`) | Would require import maps or bundler; current pattern works and is consistent with existing codebase |
| Custom EventTarget | mitt/nanoevents | External dep for a ~30-line implementation; not worth it |
| Shadow DOM | CSS scoping | Over-engineering for a single-page app |

**Installation:**
```bash
# No installation needed — zero new dependencies
```

## Architecture Patterns

### Current Architecture (Before)

```
static/
├── live.html          # 1757 lines (571 CSS + 115 HTML + 956 JS + 97 init)
├── annotations.js     # 421 lines — flag/status system
├── collapse-ui.js     # 290 lines — collapse/expand + focus mode
├── search.js          # 296 lines — Ctrl+F node search
├── diagram-editor.js  # 403 lines — add/remove/edit nodes
├── ws-client.js       # 71 lines — reconnecting WebSocket
├── annotations.css    # 357 lines — flags + editor styles
└── search.css         # 111 lines — search bar styles
```

**Problems:**
1. `live.html` inline JS (956 lines) contains ~30 global functions with implicit coupling
2. Modules reference each other via `window.*` globals (21 cross-references found)
3. Mermaid-specific SVG queries are duplicated across 4 files (regex patterns like `flowchart-(.+)-\d+` appear in annotations.js, collapse-ui.js, search.js, diagram-editor.js)
4. No event bus — modules call each other directly or through `window.*`
5. CSS is split between inline (571 lines) and external files (468 lines)

### Recommended Project Structure (After)

```
static/
├── live.html              # < 300 lines (HTML shell + script tags only)
├── main.css               # < 500 lines (extracted from live.html inline styles)
├── event-bus.js           # ~50 lines — pub/sub event bus
├── diagram-dom.js         # ~200 lines — DiagramDOM abstraction layer
├── renderer.js            # ~250 lines — Mermaid render + error panel + status styles
├── pan-zoom.js            # ~150 lines — pan, zoom, fit, transform
├── file-tree.js           # ~200 lines — sidebar file tree + CRUD operations
├── export.js              # ~200 lines — SVG/PNG export + download
├── editor-panel.js        # ~100 lines — editor textarea, resize, toggle
├── app-init.js            # ~150 lines — bootstrap, WebSocket setup, keyboard shortcuts
├── annotations.js         # 421 lines — (existing, refactored to use event bus)
├── collapse-ui.js         # 290 lines — (existing, refactored to use event bus)
├── search.js              # 296 lines — (existing, refactored to use event bus)
├── diagram-editor.js      # 403 lines — (existing, refactored to use event bus)
├── ws-client.js           # 71 lines — (unchanged)
├── annotations.css        # 357 lines — (unchanged)
└── search.css             # 111 lines — (unchanged)
```

### Pattern 1: Event Bus via EventTarget

**What:** A lightweight pub/sub system using the browser's native `EventTarget` API
**When to use:** All inter-module communication that currently goes through `window.*` globals

**Example:**
```javascript
// event-bus.js
(function() {
  'use strict';
  const target = new EventTarget();

  const EventBus = {
    on(event, handler) {
      target.addEventListener(event, (e) => handler(e.detail));
    },
    off(event, handler) {
      target.removeEventListener(event, handler);
    },
    emit(event, data) {
      target.dispatchEvent(new CustomEvent(event, { detail: data }));
    },
    once(event, handler) {
      target.addEventListener(event, (e) => handler(e.detail), { once: true });
    }
  };

  window.SmartBEventBus = EventBus;
})();
```

**Event catalog (planned):**

| Event | Emitter | Consumers | Payload |
|-------|---------|-----------|---------|
| `diagram:rendered` | renderer | annotations, collapse, search | `{ svg }` |
| `diagram:error` | renderer | app-init (status) | `{ error, code }` |
| `file:selected` | file-tree | renderer, editor, annotations | `{ path }` |
| `file:saved` | editor-panel, annotations | file-tree (refresh) | `{ path, content }` |
| `content:changed` | ws-client, editor | renderer | `{ content, source }` |
| `zoom:changed` | pan-zoom | search (scroll-to) | `{ zoom, panX, panY }` |
| `mode:changed` | annotations, editor | pan-zoom (disable pan) | `{ mode }` |
| `flags:changed` | annotations | renderer (re-apply SVG) | `{ flags }` |
| `toast` | any module | app-init (toast display) | `{ message }` |

### Pattern 2: DiagramDOM Abstraction

**What:** A single module that encapsulates all Mermaid-specific SVG DOM queries
**When to use:** Any code that reads or modifies diagram SVG elements

**Example:**
```javascript
// diagram-dom.js
(function() {
  'use strict';

  const DiagramDOM = {
    getSVG() {
      return document.querySelector('#preview svg');
    },

    findNodeElement(nodeId) {
      const svg = this.getSVG();
      if (!svg) return null;
      for (const el of svg.querySelectorAll('[id]')) {
        const id = el.getAttribute('id');
        const match = id?.match(/^flowchart-(.+)-\d+$/);
        if (match && match[1] === nodeId) return el;
      }
      return null;
    },

    findSubgraphElement(subgraphId) {
      const svg = this.getSVG();
      if (!svg) return null;
      for (const el of svg.querySelectorAll('[id]')) {
        const id = el.getAttribute('id');
        const match = id?.match(/^subGraph\d+-(.+)-\d+$/);
        if (match && match[1] === subgraphId) return el;
      }
      return null;
    },

    getNodeBBox(nodeId) {
      const el = this.findNodeElement(nodeId);
      return el?.getBBox?.() ?? null;
    },

    getNodeLabel(nodeId) {
      const el = this.findNodeElement(nodeId);
      if (!el) return null;
      const label = el.querySelector('.nodeLabel');
      return label?.textContent ?? null;
    },

    extractNodeId(element) {
      // Walk up the DOM to find node/edge/subgraph identity
      // Consolidates the logic currently duplicated in annotations.js
      let el = element;
      while (el && el !== document.body) {
        const id = el.getAttribute?.('id');
        if (id) {
          const nodeMatch = id.match(/^flowchart-(.+)-\d+$/);
          if (nodeMatch) return { type: 'node', id: nodeMatch[1] };
          const edgeMatch = id.match(/^L-(.+)$/);
          if (edgeMatch) return { type: 'edge', id: 'L-' + edgeMatch[1] };
          const subMatch = id.match(/^subGraph\d+-(.+)-\d+$/);
          if (subMatch) return { type: 'subgraph', id: subMatch[1] };
        }
        el = el.parentElement;
      }
      return null;
    },

    getAllNodeLabels() {
      const svg = this.getSVG();
      if (!svg) return [];
      return Array.from(svg.querySelectorAll('.nodeLabel'));
    },

    findMatchParent(element) {
      let current = element;
      while (current && current.tagName !== 'svg') {
        if (current.classList?.contains('node') || current.classList?.contains('cluster')) {
          return current;
        }
        current = current.parentElement;
      }
      return null;
    },

    highlightNode(nodeId, on) {
      const el = this.findNodeElement(nodeId);
      if (!el) return;
      el.style.outline = on ? '3px solid #6366f1' : '';
      el.style.outlineOffset = on ? '4px' : '';
    },

    getViewBox() {
      const svg = this.getSVG();
      if (!svg) return null;
      return svg.viewBox?.baseVal ?? null;
    }
  };

  window.DiagramDOM = DiagramDOM;
})();
```

**Key insight:** DiagramDOM consolidates 4 separate implementations of `extractNodeId()` (in annotations.js, collapse-ui.js, search.js, and diagram-editor.js via annotations) into one canonical implementation. This is critical for Phase 11 (custom renderer) — when the renderer changes, only DiagramDOM needs to be updated.

### Pattern 3: Hooks Object to Event Bus Migration

**What:** Replace the current `hooks` pattern with event bus subscriptions
**When to use:** Converting existing modules to use the event bus

**Current pattern (hooks object):**
```javascript
// In annotations.js
let hooks = {
    getEditor: () => document.getElementById('editor'),
    getCurrentFile: () => window.currentFile || '',
    saveFile: null,
    renderDiagram: null,
};
// In live.html init block
SmartBAnnotations.init({
    getEditor: () => document.getElementById('editor'),
    getCurrentFile: () => currentFile,
    saveFile: saveCurrentFile,
    renderDiagram: render,
});
```

**Target pattern (event bus):**
```javascript
// annotations.js subscribes to events
SmartBEventBus.on('diagram:rendered', () => applyFlagsToSVG());
SmartBEventBus.on('file:selected', (d) => { loadAnnotations(d.content); });

// annotations.js emits events
function onFlagsChanged() {
    SmartBEventBus.emit('flags:changed', { flags: state.flags });
    SmartBEventBus.emit('file:save-requested', { content: getAnnotatedContent() });
}
```

### Anti-Patterns to Avoid

- **Big-bang rewrite:** Do NOT try to rewrite everything at once. Extract one module at a time and verify tests pass after each extraction. The strangler fig pattern is mandatory.
- **ES modules without bundler:** Do NOT switch from IIFEs to `import`/`export` — the project serves static files raw from `dist/static/` with no bundler step. IIFEs with `window.*` exports are the established pattern.
- **Premature abstraction in DiagramDOM:** Do NOT add methods for diagram types that don't exist yet (sequence, state, etc.). Only abstract what Mermaid flowcharts currently use. Phase 11 will extend this.
- **Changing HTML structure:** The HTML element IDs (`#preview`, `#editor`, `#fileTree`, etc.) are referenced by CSS, JS, and the VS Code extension's webview. Changing them would break things silently.
- **Dropping the hooks pattern prematurely:** During migration, modules should support BOTH hooks and event bus. Remove hooks only after all callers have migrated to events.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Event pub/sub | Custom linked list impl | `EventTarget` + `CustomEvent` | Native, debuggable, typed `detail`, zero overhead |
| CSS extraction | Manual copy-paste | Automated extraction | 571 lines of inline CSS — easy to miss selectors |
| Module loading order | Custom dependency resolver | Script tag order in HTML | Simple, reliable, no circular deps possible |
| SVG coordinate math | Manual viewBox parsing | `getBBox()` + `getBoundingClientRect()` | Already used; native SVG API handles all transforms |

**Key insight:** This phase has NO external dependencies. Every tool needed is a browser API. Resist the urge to add npm packages.

## Common Pitfalls

### Pitfall 1: Breaking Implicit Load Order
**What goes wrong:** Moving code into external files changes execution timing. Code that ran inline (synchronous, in order) now loads asynchronously if script tags lack proper ordering.
**Why it happens:** `live.html` inline JS runs synchronously top-to-bottom. External `<script>` tags also run synchronously but only after download. The current init block at lines 1659-1755 depends on ALL external modules being loaded first.
**How to avoid:** Keep `<script>` tags without `async`/`defer`. Order: event-bus.js first, then diagram-dom.js, then feature modules, then app-init.js last.
**Warning signs:** `TypeError: SmartBEventBus is not defined` or `undefined is not a function`.

### Pitfall 2: Stale Event References After Re-render
**What goes wrong:** After `mermaid.render()`, the entire SVG is replaced (`innerHTML = svg`). Any event listeners or element references attached to SVG nodes become invalid.
**Why it happens:** Mermaid's `render()` produces a new SVG string; setting `innerHTML` destroys all previous DOM nodes.
**How to avoid:** Use event delegation on `#preview-container` (already done in annotations.js and collapse-ui.js). DiagramDOM must always re-query elements, never cache them.
**Warning signs:** Click handlers stop working after diagram update; `getBBox()` returns null.

### Pitfall 3: CSS Specificity Breakage
**What goes wrong:** Moving inline `<style>` to an external `.css` file can change cascade order relative to other stylesheets.
**Why it happens:** `<style>` in `<head>` comes before `<link>` tags in the current markup. Moving to external CSS means it now competes in source order with `annotations.css` and `search.css`.
**How to avoid:** Place `<link rel="stylesheet" href="main.css">` as the FIRST stylesheet in `<head>`, before `annotations.css` and `search.css`. This preserves the cascade.
**Warning signs:** Flag popover styles break; search bar appears differently; node highlighting lost.

### Pitfall 4: Drag & Drop Dead Code
**What goes wrong:** The drag & drop handler at line 1638-1652 references `knownFiles` and `renderFileList()` which are undefined (legacy code from before the file tree refactor).
**Why it happens:** Code was left behind from an earlier architecture.
**How to avoid:** During extraction, either fix the drag & drop to use the current `treeData`/`renderTree()` or remove it. Do NOT carry the broken code forward.
**Warning signs:** Console error `knownFiles is not defined` when dropping a file.

### Pitfall 5: Export PNG Double Mermaid Reinitialize
**What goes wrong:** `exportPNG()` (lines 1268-1410) reinitializes Mermaid three times with identical config (except `htmlLabels`). If this code is extracted and the config object isn't shared, a mismatch will cause rendering differences.
**Why it happens:** The config is duplicated 3 times inline (143 lines of identical config).
**How to avoid:** Extract a shared `MERMAID_CONFIG` object. `exportPNG` only overrides `htmlLabels: false` for the Canvas-safe render.
**Warning signs:** Diagrams look different after PNG export; node labels change size.

### Pitfall 6: Existing Tests are Server-Side Only
**What goes wrong:** The 131 existing tests are all Node.js/Vitest tests for the server. None test the browser UI. Refactoring could break browser behavior without any test catching it.
**Why it happens:** The project has no browser testing infrastructure (no Playwright, no jsdom for static files).
**How to avoid:** Manual verification is required after each extraction: load `live.html`, test flags, search, collapse, export, file tree, pan/zoom, editor. Consider adding a manual test checklist. Do NOT promise automated browser tests in this phase — that's scope creep.
**Warning signs:** All 131 tests pass but features are broken in browser.

## Code Examples

### Verified: Current Module Loading (live.html lines 1654-1658)
```html
<!-- External scripts loaded AFTER inline JS block -->
<script src="ws-client.js"></script>
<script src="collapse-ui.js"></script>
<script src="annotations.js"></script>
<script src="diagram-editor.js"></script>
<script src="search.js"></script>
```

### Verified: Current Hook-Based Initialization (live.html lines 1661-1673)
```javascript
const _initHooks = {
    getEditor: () => document.getElementById('editor'),
    getCurrentFile: () => currentFile,
    getLastContent: () => lastContent,
    setLastContent: (v) => { lastContent = v; },
    saveFile: saveCurrentFile,
    renderDiagram: render,
    getPan: () => ({ panX, panY, zoom }),
    setPan: (px, py) => { panX = px; panY = py; applyTransform(); },
};
SmartBAnnotations.init(_initHooks);
MmdEditor.init(_initHooks);
SmartBSearch.init(_initHooks);
```

### Verified: Mermaid SVG ID Patterns (found across 4 files)
```javascript
// Node IDs: flowchart-{nodeId}-{counter}
id.match(/^flowchart-(.+)-\d+$/);  // in annotations.js, collapse-ui.js, diagram-editor.js

// Subgraph IDs: subGraph{counter}-{subgraphId}-{counter}
id.match(/^subGraph\d+-(.+)-\d+$/); // in annotations.js, collapse-ui.js

// Edge IDs: L-{source}-{target}-{index}
id.match(/^L-(.+)$/);               // in annotations.js

// CSS classes: .node, .cluster, .edgePath, .flowchart-link, .nodeLabel, .cluster-label
```

### Target: Script Loading Order in Refactored live.html
```html
<!-- Styles -->
<link rel="stylesheet" href="main.css">
<link rel="stylesheet" href="annotations.css">
<link rel="stylesheet" href="search.css">

<!-- Core infrastructure (must load first) -->
<script src="event-bus.js"></script>
<script src="diagram-dom.js"></script>

<!-- Feature modules (no dependency on each other) -->
<script src="renderer.js"></script>
<script src="pan-zoom.js"></script>
<script src="file-tree.js"></script>
<script src="export.js"></script>
<script src="editor-panel.js"></script>
<script src="ws-client.js"></script>
<script src="collapse-ui.js"></script>
<script src="annotations.js"></script>
<script src="diagram-editor.js"></script>
<script src="search.js"></script>

<!-- Bootstrap (must load last) -->
<script src="app-init.js"></script>
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Script concatenation | IIFEs with `window.*` exports | Established pattern | No bundler needed |
| Direct DOM queries per module | Shared DiagramDOM abstraction | Phase 9 target | Single point of change for Phase 11 |
| `window.*` globals for communication | Event bus (pub/sub) | Phase 9 target | Loose coupling, testable |
| Inline `<style>` + `<script>` | External `.css` + `.js` files | Phase 9 target | `live.html` < 300 lines |

**Deprecated/outdated:**
- `knownFiles` / `renderFileList()` — referenced in drag & drop handler but never defined; dead code from pre-file-tree era

## Inventory: What Must Be Extracted from live.html

### Inline CSS (571 lines, lines 12-582)
Extract to `main.css`. Contains:
- CSS variables (`:root`)
- Layout (topbar, sidebar, content, editor-panel, preview-panel)
- File tree styles (.tree-folder, .tree-file, etc.)
- Zoom controls, toast, help overlay, breadcrumbs, auto-collapse notice
- Focus mode styles

### Inline JS Block 1 (956 lines, lines 698-1653)
Must be split into ~7 modules:

| Concern | Lines | Target Module | Est. Lines |
|---------|-------|---------------|------------|
| State vars + Mermaid init | 698-742 | renderer.js | ~45 |
| escapeHtml + Status injection | 744-781 | renderer.js | ~40 |
| Error icon + error panel | 784-905 | renderer.js | ~120 |
| render() + applyTransform() | 908-940 | renderer.js | ~35 |
| Pan & zoom (wheel, drag, fit, buttons) | 942-1018 | pan-zoom.js | ~80 |
| Editor textarea events | 1021-1039 | editor-panel.js | ~20 |
| syncFile (fetch) | 1042-1066 | app-init.js (or file-tree) | ~25 |
| File tree (treeData, render, CRUD) | 1069-1520 | file-tree.js | ~200 (+ inline HTML gen) |
| Auto-sync toggle + panel toggles | 1206-1258 | editor-panel.js | ~55 |
| Export SVG/PNG + download | 1261-1418 | export.js | ~160 |
| Toast | 1422-1427 | app-init.js | ~6 |
| Keyboard shortcuts | 1429-1453, 1522-1527 | app-init.js | ~30 |
| Save/delete/rename/move | 1456-1520 | file-tree.js | ~65 |
| showHelp | 1529-1531 | app-init.js | ~3 |
| Init IIFE | 1537-1631 | app-init.js | ~95 |
| Window resize + drag & drop | 1636-1652 | app-init.js | ~17 |

### Inline JS Block 2 — Init (97 lines, lines 1659-1755)
Moves entirely to `app-init.js`.

## Migration Strategy: Strangler Fig Order

The extraction order matters. Extract modules with the fewest dependencies first:

1. **event-bus.js** — Zero dependencies, zero consumers initially. Foundation for everything else.
2. **main.css** — Extract inline `<style>`. No behavioral change. Easiest verification.
3. **diagram-dom.js** — No dependencies except `#preview svg`. Consolidates duplicated SVG queries.
4. **renderer.js** — Depends on event-bus, diagram-dom. Extracts render(), error panel, Mermaid config, status styles.
5. **pan-zoom.js** — Depends on event-bus. Extracts zoom/pan state and handlers.
6. **export.js** — Depends on renderer (shared Mermaid config), diagram-dom. Self-contained.
7. **file-tree.js** — Depends on event-bus. Extracts file tree rendering and CRUD.
8. **editor-panel.js** — Depends on event-bus, renderer. Extracts editor textarea and resize.
9. **app-init.js** — The "last mile" — bootstrap code, keyboard shortcuts, WebSocket setup.
10. **Refactor existing modules** — Update annotations.js, collapse-ui.js, search.js, diagram-editor.js to use event bus + DiagramDOM instead of hooks + window.* + direct SVG queries.

Each step should:
1. Move code to new module
2. Update `live.html` to load it
3. Verify browser behavior manually
4. Verify 131 server tests still pass
5. Commit

## Open Questions

1. **Should existing modules (annotations.js, etc.) be refactored to use event bus in this phase, or only new modules?**
   - What we know: The success criteria say "Modules communicate via an event bus, not window.* globals." This implies ALL modules must use the event bus.
   - What's unclear: Whether to refactor existing modules incrementally alongside extraction, or as a second pass after all extraction is complete.
   - Recommendation: Hybrid approach — extract new modules with event bus from day one; refactor existing modules as the final step of Phase 9. This keeps each step small and verifiable. During the transition, existing modules can consume both hooks AND event bus.

2. **VS Code extension webview re-use?**
   - What we know: The VS Code extension (`vscode-extension/src/webview/main.ts`) has its own Mermaid rendering that duplicates some patterns from `live.html` (SVG queries, flag handling).
   - What's unclear: Whether DiagramDOM should be shared with the VS Code extension.
   - Recommendation: Do NOT share in Phase 9. The VS Code webview is TypeScript with a different build pipeline. Note it as a future consolidation target post-Phase 9.

3. **Browser testing?**
   - What we know: All 131 tests are server-side Node.js tests. No browser tests exist.
   - What's unclear: Whether Phase 9 should add Playwright/browser testing.
   - Recommendation: Out of scope for Phase 9. Manual verification checklist is sufficient. Browser testing can be a separate effort.

## Sources

### Primary (HIGH confidence)
- `/Users/simoni/Desktop/smartb-diagrams/static/live.html` — 1757 lines analyzed line-by-line
- `/Users/simoni/Desktop/smartb-diagrams/static/annotations.js` — 421 lines, 21 window.* refs
- `/Users/simoni/Desktop/smartb-diagrams/static/collapse-ui.js` — 290 lines
- `/Users/simoni/Desktop/smartb-diagrams/static/search.js` — 296 lines
- `/Users/simoni/Desktop/smartb-diagrams/static/diagram-editor.js` — 403 lines
- `/Users/simoni/Desktop/smartb-diagrams/static/ws-client.js` — 71 lines
- `/Users/simoni/Desktop/smartb-diagrams/tsup.config.ts` — confirms static files copied raw (no bundler)
- `/Users/simoni/Desktop/smartb-diagrams/src/server/static.ts` — confirms raw file serving
- Vitest test suite — 131 tests passing, all server-side

### Secondary (MEDIUM confidence)
- [MDN: JavaScript Modules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Modules) — ES module reference
- [CSS-Tricks: Native Event Bus](https://css-tricks.com/lets-create-a-lightweight-native-event-bus-in-javascript/) — EventTarget pattern
- [Qodo: Refactoring Frontend Code](https://www.qodo.ai/blog/refactoring-frontend-code-turning-spaghetti-javascript-into-modular-maintainable-components/) — Modular refactoring strategy
- [Felt: SVG to Canvas interactions](https://felt.com/blog/svg-to-canvas-part-2-building-interactions) — DOM abstraction for diagrams

### Tertiary (LOW confidence)
- [Medium: Strangler Pattern for Frontend](https://medium.com/@felipegaiacharly/strangler-pattern-for-frontend-865e9a5f700f) — Pattern validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies, using existing patterns and browser APIs
- Architecture: HIGH — clear extraction boundaries identified from line-by-line analysis of live.html
- Pitfalls: HIGH — identified from actual code analysis (dead code, duplicate configs, load order)
- DiagramDOM API design: MEDIUM — API surface is clear from current usage, but edge cases may emerge during implementation

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable — no external dependency changes expected)
