# Technology Stack

**Project:** SmartB Diagrams v2 -- Interactive Canvas + AI Observability
**Researched:** 2026-02-15
**Scope:** NEW stack additions for v2 milestone only. Existing stack (ws, commander, chokidar, zod, MCP SDK, tsup, vitest) is validated and not re-researched.

---

## Recommended Stack Additions

### Graph Layout Engine

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **elkjs** | ^0.11.0 | Automatic graph layout (node positioning) | ELK (Eclipse Layout Kernel) is the gold standard for hierarchical/layered graph layout. It replaces Mermaid's internal Dagre-based layout with a far more configurable engine. Supports layered, force, stress, radial, and box algorithms. 8MB unpacked but only the `elk.bundled.js` (~1.2MB minified) is needed in browser. Zero runtime dependencies. Web Worker support for non-blocking layout on large graphs. Used by Mermaid itself via `@mermaid-js/layout-elk`, React Flow, Svelte Flow, Eclipse GLSP, and Sprotty. |

**Why ELK.js over alternatives:**

| Engine | Verdict | Reason |
|--------|---------|--------|
| **ELK.js** | **USE THIS** | Best hierarchical layout quality. Ports support (future: typed edges). Compound graphs (subgraphs). Web Worker support. Active maintenance (Kiel University). |
| dagre / @dagrejs/dagre | REJECT | Unmaintained since 2015. Codebase frozen. Limited layout options. No compound graph support. 830KB unpacked but produces inferior layouts for complex diagrams. |
| d3-force | REJECT | Physics-based, non-deterministic. Produces different layouts each run. Not suitable for AI reasoning diagrams that need stable, reproducible layouts. Good for social networks, bad for flowcharts. |
| d3-hierarchy | REJECT | Requires single root node. Assigns uniform width/height to all nodes. Too restrictive for our varied diagram types. |
| Cytoscape.js | REJECT | Full graph visualization framework (280KB+ minified). Includes its own rendering, events, styling. We need layout-only; adding Cytoscape means fighting its rendering system or using it as an overweight layout calculator. |

### .mmd Parsing to Graph Model

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **@mermaid-js/parser** | ^0.6.3 | Parse .mmd text to AST | Already a devDependency. Produces a structured AST from Mermaid flowchart syntax using Langium (Chevrotain-based lexer/parser). Move to runtime dependency for server-side AST extraction. The AST is the source of truth for building our internal graph model that feeds ELK.js. |
| **Custom AST-to-ELK transformer** | n/a (built in-house) | Convert Mermaid AST to ELK JSON graph | No library exists for this. Write a ~200-line transformer: `MermaidAST -> { children: ElkNode[], edges: ElkEdge[] }`. Maps node shapes, edge types, subgraph hierarchy to ELK's `children`/`edges`/`layoutOptions` format. |

**Why not regex parsing:** The existing `src/diagram/parser.ts` uses regex for simple node/edge extraction. This works for annotation injection but is too fragile for full graph model construction. `@mermaid-js/parser` uses a proper grammar (Langium) and handles all Mermaid flowchart syntax edge cases (quoted labels, special characters, nested subgraphs, multiple edge types).

**Why not Mermaid's internal parser (mermaid.mermaidAPI.parse):** Requires browser DOM. Cannot run server-side. Also, the internal `parser.yy` API is undocumented and changes between Mermaid versions. `@mermaid-js/parser` is the official, stable, server-side parsing solution.

### SVG Rendering (Custom Canvas)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Native SVG DOM API** | n/a (built-in) | Render nodes, edges, labels as SVG elements | No library needed. The browser's native `document.createElementNS('http://www.w3.org/2000/svg', ...)` API is sufficient for creating `<rect>`, `<text>`, `<path>`, `<g>` elements. Vanilla JS constraint means no React/Vue. SVG.js (2.6MB) adds convenience but not enough value for our specific use case where we control all shapes. Custom rendering gives us full control over node appearance, interaction targets, and data attributes for observability features. |
| **elkjs-svg** | Reference only | SVG generation from ELK JSON | Study its approach (~32KB, zero deps) but do NOT use directly. It produces static SVG without interactivity. Instead, build a custom renderer inspired by its pattern: iterate ELK's layouted JSON, create SVG elements with positions from layout. Our renderer adds interaction handlers, data attributes, CSS classes, and animation support that elkjs-svg lacks. |

**Why not SVG.js / @svgdotjs/svg.js:**
- 2.6MB unpacked. Adds a fluent API (`draw.rect(100,50).fill('#f06')`) that looks nice but creates an abstraction layer between us and the DOM.
- Every SVG element becomes a wrapper object. For a diagram with 100+ nodes, that is 100+ wrapper objects we do not need.
- The native SVG API is well-documented, performant, and gives us direct access to element properties.
- Our static JS files are vanilla -- adding SVG.js means either a CDN load or bundling it, increasing page weight.

**Why not Snap.svg:**
- Abandoned. Last significant update was years ago.
- Adobe stopped maintaining it.

### Heatmap / Overlay Rendering

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **simpleheat** | ^0.4.0 | Canvas-based heatmap rendering | Tiny (3KB), zero dependencies, by Mourner (Leaflet/Mapbox). Renders heatmap on a `<canvas>` element that overlays our SVG diagram. Canvas is transparent by default so it layers perfectly. API: `simpleheat(canvas).data(points).radius(r).draw()`. Points are `[x, y, intensity]` triples -- maps directly to node visit counts. Used in production by Leaflet.heat. |

**Integration approach:** Position a `<canvas>` element absolutely over the SVG diagram container. When heatmap mode is active, map each node's `(cx, cy)` from the SVG layout to canvas coordinates, with intensity proportional to visit count / execution frequency. The SVG shows through the transparent canvas, and the heatmap gradient overlays it.

**Why not pure SVG heatmap:** SVG does not support radial gradients that blend between arbitrary points efficiently. Canvas with simpleheat produces smooth, performant heatmaps even with 200+ data points. SVG-based approaches require one `<radialGradient>` per point, which tanks performance.

**Why not heatmap.js:** 36KB, more features than needed (click events, legend, etc.). simpleheat is the rendering core that heatmap.js itself wraps.

### Undo/Redo System

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Custom Command Pattern** | n/a (built in-house) | Undo/redo for all diagram mutations | No library. The Command Pattern is straightforward to implement in ~150 lines. Each command has `execute()` and `undo()` methods. A `CommandHistory` manager maintains two stacks (undo/redo). Batching support for compound operations (e.g., "move node" = position change + edge re-route). This is the standard approach used by three.js editor, VS Code, Figma, and every serious editor. |

**Why not a library (e.g., `undo-manager`, `immer` patches):**
- Undo-manager npm packages are typically <100 lines and unmaintained.
- Immer patches track object mutations but do not understand graph semantics (adding a node must also undo edge connections).
- Our commands are domain-specific: `AddNodeCommand`, `MoveNodeCommand`, `AddEdgeCommand`, `ChangeStatusCommand`, `SetBreakpointCommand`. These encode graph-level intent, not generic object diffs.

### Session Recording / Replay

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **Custom event stream** | n/a (built in-house) | Record diagram state changes over time | Lightweight JSON event log, not DOM recording. Each event is `{ timestamp, type, payload }` -- e.g., `{ ts: 1234, type: 'node:status', payload: { id: 'A', status: 'ok' } }`. Store as JSONL (one event per line) on disk. Replay by replaying events at recorded timestamps. ~50-100 bytes per event. |

**Why not rrweb:** rrweb records full DOM snapshots and mutations (clicks, scrolls, CSS changes). It is designed for user session replay of web pages. We need AI agent action replay -- a stream of diagram state changes (node status updates, edge additions, flag annotations). rrweb would capture irrelevant UI interactions (scrolling, panel resizing) and miss the semantic meaning of diagram changes. Our event stream is 100x smaller and directly meaningful.

**Data format:**
```jsonl
{"ts":1708012345000,"type":"session:start","payload":{"file":"plan.mmd","nodes":12}}
{"ts":1708012345100,"type":"node:status","payload":{"id":"A","status":"in-progress"}}
{"ts":1708012345500,"type":"node:status","payload":{"id":"A","status":"ok"}}
{"ts":1708012346000,"type":"edge:add","payload":{"from":"A","to":"B","label":"next"}}
{"ts":1708012347000,"type":"node:status","payload":{"id":"B","status":"problem"}}
{"ts":1708012348000,"type":"flag:add","payload":{"nodeId":"B","message":"Wrong approach"}}
```

### Ghost Path / Breakpoint Rendering

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| **SVG animations + CSS** | n/a (built-in) | Ghost path animation, breakpoint indicators | Ghost paths (showing alternative/discarded reasoning paths) are rendered as dashed SVG `<path>` elements with reduced opacity and CSS animation (`stroke-dashoffset` animation). Breakpoint indicators are SVG circles with pulsing CSS animation overlaid on nodes. No library needed -- CSS animations on SVG elements are well-supported in all modern browsers and performant. |

**Ghost path rendering approach:**
- When the AI discards a reasoning path, the nodes along that path get `status: 'discarded'`.
- The renderer draws edges to discarded nodes with `stroke-dasharray: "8,4"`, `opacity: 0.3`, and a CSS class `.ghost-edge`.
- Optional: animate `stroke-dashoffset` for a "flowing" ghost effect.

**Breakpoint rendering approach:**
- A breakpoint is a flag annotation with `type: 'breakpoint'`.
- The renderer adds a red circle SVG indicator at the node's top-right corner.
- When the AI reaches a breakpoint node, execution pauses (MCP tool returns a "paused at breakpoint" status).
- The indicator pulses via CSS `@keyframes`.

---

## Internal Graph Model (New Type Definitions)

These types bridge the Mermaid AST and ELK layout engine. They are the core data model for v2.

```typescript
// ─── Graph Model (replaces DiagramNode/DiagramEdge for v2) ───

interface GraphNode {
  id: string;
  label: string;
  shape: 'rect' | 'rounded' | 'circle' | 'diamond' | 'hexagon' | 'stadium';
  status?: NodeStatus;
  width: number;    // computed from label text
  height: number;   // computed from label text
  // After layout:
  x?: number;
  y?: number;
  // Observability:
  visitCount?: number;      // for heatmap
  breakpoint?: boolean;     // for breakpoint indicator
  ghostPath?: boolean;      // for ghost rendering
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type: 'arrow' | 'open' | 'dotted' | 'thick';
  // After layout:
  sections?: ElkEdgeSection[];
  // Observability:
  ghostPath?: boolean;
}

interface GraphGroup {
  id: string;
  label: string;
  children: string[];       // node IDs
  childGroups: string[];    // nested group IDs
  parent?: string;
  collapsed?: boolean;
}

interface DiagramGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  groups: Map<string, GraphGroup>;
  metadata: {
    diagramType: string;
    direction: 'LR' | 'RL' | 'TB' | 'BT';
  };
}

// ─── ELK Integration Types ───

interface ElkLayoutResult {
  nodes: Map<string, { x: number; y: number; width: number; height: number }>;
  edges: Map<string, { sections: ElkEdgeSection[] }>;
  groups: Map<string, { x: number; y: number; width: number; height: number }>;
}

// ─── Undo/Redo Types ───

interface Command {
  type: string;
  execute(): void;
  undo(): void;
  description: string;    // for UI display
}

interface CommandHistory {
  undoStack: Command[];
  redoStack: Command[];
  maxSize: number;         // prevent unbounded memory growth
}

// ─── Session Recording Types ───

interface SessionEvent {
  ts: number;              // Unix timestamp ms
  type: string;            // e.g., 'node:status', 'edge:add', 'flag:add'
  payload: Record<string, unknown>;
}

interface Session {
  id: string;
  file: string;
  startedAt: number;
  events: SessionEvent[];
}

// ─── Heatmap Types ───

interface HeatmapData {
  points: Array<[number, number, number]>;  // [x, y, intensity]
  maxIntensity: number;
}
```

---

## Integration Architecture

### Data Flow: .mmd File to Interactive Canvas

```
.mmd file (on disk)
    |
    v
@mermaid-js/parser  (server-side, AST extraction)
    |
    v
AST-to-Graph transformer  (server-side, custom)
    |
    v
DiagramGraph model  (shared between server and client)
    |
    v
ELK.js layout  (browser-side, via Web Worker)
    |
    v
Custom SVG renderer  (browser-side, vanilla JS)
    |
    v
Interactive SVG in DOM  (drag, select, hover, breakpoints, ghost paths)
    |
    v
Heatmap canvas overlay  (simpleheat, when heatmap mode active)
```

### Where Each Technology Runs

| Technology | Runs In | Rationale |
|------------|---------|-----------|
| @mermaid-js/parser | Node.js server | Parse .mmd to AST server-side. Send graph model JSON to browser via WebSocket. |
| ELK.js | Browser (Web Worker) | Layout computation is CPU-intensive for large graphs. Web Worker prevents UI blocking. Browser-side means layout responds to drag interactions without server round-trip. |
| Custom SVG renderer | Browser | Renders SVG from layouted graph. Handles all interactions (drag, click, hover). |
| simpleheat | Browser | Canvas overlay for heatmap mode. |
| Undo/redo (CommandHistory) | Browser | All undo/redo is client-side. Commands modify the graph model and re-render. Save back to server via existing WebSocket/REST. |
| Session recording | Node.js server | Server records events from MCP tool calls and file changes. Replay data sent to browser on demand. |

### Bundling Strategy

| Asset | Bundle Approach | Delivery |
|-------|----------------|----------|
| elkjs | `elk.bundled.min.js` served as static asset from `dist/static/` | `<script>` tag in live.html (like current Mermaid CDN) |
| elkjs Web Worker | `elk-worker.min.js` in `dist/static/` | Loaded by elkjs when Web Worker mode enabled |
| simpleheat | Copy `simpleheat.js` (3KB) to `static/` | `<script>` tag in live.html |
| @mermaid-js/parser | Bundled into server dist by tsup | Server-side only, part of `dist/cli.js` |
| Custom renderer | `canvas-renderer.js` in `static/` | `<script>` tag in live.html |
| Undo/redo module | `undo-redo.js` in `static/` | `<script>` tag in live.html |
| Session replay UI | `session-replay.js` in `static/` | `<script>` tag in live.html |

**Critical:** elkjs must be served as a static file, not bundled by tsup. tsup targets Node.js (`platform: 'node'`). elkjs's browser bundle (`elk.bundled.js`) is a self-contained IIFE that works directly in the browser.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Layout engine | ELK.js | dagre | Unmaintained, inferior layout quality, no compound graphs |
| Layout engine | ELK.js | d3-force | Non-deterministic, wrong paradigm for directed flowcharts |
| Layout engine | ELK.js | Cytoscape.js | Too heavy (full framework), fights our custom rendering |
| SVG rendering | Native SVG DOM | SVG.js | Unnecessary abstraction, 2.6MB overhead, wrapper objects |
| SVG rendering | Native SVG DOM | Snap.svg | Abandoned by Adobe |
| SVG rendering | Native SVG DOM | elkjs-svg | Static output only, no interactivity |
| Heatmap | simpleheat | heatmap.js | 12x larger, features we do not need |
| Heatmap | simpleheat | Pure SVG gradients | Poor performance with many points, complex to implement |
| Heatmap | simpleheat | WebGL (visual-heatmap) | Overkill for our data sizes (<500 points) |
| Undo/redo | Custom command pattern | Immer patches | Does not understand graph semantics |
| Undo/redo | Custom command pattern | undo-manager npm | Unmaintained, trivially small, not worth a dependency |
| Session replay | Custom event stream | rrweb | Records DOM, not diagram semantics; 100x more data |
| .mmd parsing | @mermaid-js/parser | Regex (current) | Too fragile for full graph model, misses edge cases |
| .mmd parsing | @mermaid-js/parser | mermaid.mermaidAPI.parse | Requires browser DOM, undocumented internal API |

---

## Installation

```bash
# NEW runtime dependency
npm install elkjs

# MOVE from devDependencies to dependencies
# @mermaid-js/parser is already installed as devDep -- move to dependencies
npm install @mermaid-js/parser

# NEW browser-only assets (copy to static/, not npm install)
# simpleheat: download from https://github.com/mourner/simpleheat
# elk.bundled.min.js: copy from node_modules/elkjs/lib/elk.bundled.min.js

# No other new npm packages needed
```

### Post-install setup

```bash
# Copy ELK.js browser bundle to static assets
cp node_modules/elkjs/lib/elk.bundled.js static/elk.bundled.js
cp node_modules/elkjs/lib/elk-worker.min.js static/elk-worker.min.js

# Download simpleheat (3KB, no npm package needed)
curl -o static/simpleheat.js https://raw.githubusercontent.com/mourner/simpleheat/gh-pages/simpleheat.js
```

Alternatively, add a build step in tsup `onSuccess` to copy these files:

```typescript
// tsup.config.ts addition
onSuccess: async () => {
  cpSync('static', 'dist/static', { recursive: true });
  cpSync('node_modules/elkjs/lib/elk.bundled.js', 'dist/static/elk.bundled.js');
  cpSync('node_modules/elkjs/lib/elk-worker.min.js', 'dist/static/elk-worker.min.js');
}
```

---

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **React/Vue/Svelte** | Project constraint: vanilla JS in browser. Adding a framework means bundling it, a build step for static assets, and fighting the existing vanilla JS codebase. | Native DOM API + SVG API |
| **D3.js (full)** | 250KB+ for a visualization library. We need layout (ELK) and rendering (native SVG), not D3's bindable data-joins. D3 is designed for data visualization, not interactive editors. | ELK.js (layout) + native SVG (rendering) |
| **Cytoscape.js** | 280KB+ graph framework. Has its own rendering, events, styling. We would use 5% of its API (layout) and ignore the rest. Philosophical mismatch: Cytoscape renders; we want to render ourselves. | ELK.js |
| **Konva.js / Fabric.js** | Canvas-based rendering libraries. We need SVG (for CSS styling, DOM event handling, and export). Canvas libraries mean re-implementing text layout, hit testing, and losing SVG export. | Native SVG |
| **Joint.js / mxGraph** | Commercial / heavy diagramming frameworks. Joint.js is 400KB+. mxGraph is abandoned (now draw.io internals). Both impose their own data model. | Custom graph model + ELK.js + native SVG |
| **Mermaid.js** (for v2 rendering) | v2 replaces Mermaid rendering with custom canvas. Mermaid stays for backward compat / fallback but is not the primary renderer. Do not add new Mermaid dependencies. | Custom SVG renderer with ELK.js layout |
| **rrweb** | 50KB+ library for DOM session replay. Records clicks, scrolls, CSS mutations. We need diagram state changes, not UI replay. | Custom JSONL event stream |
| **WebSocket library for client** | The browser has native `WebSocket`. The existing `ws-client.js` already implements reconnection with exponential backoff. Do not add socket.io-client or similar. | Native `WebSocket` API (already in use) |

---

## Version Compatibility (New Dependencies)

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `elkjs@^0.11.0` | Browser (all modern), Node >= 12 | Browser bundle is self-contained IIFE. Web Worker version needs `elk-worker.min.js` served as static asset. |
| `@mermaid-js/parser@^0.6.3` | Node >= 18 | Uses Langium internally. ESM-only. Already a devDependency, moving to runtime dependency for server-side parsing. |
| `simpleheat@0.4.0` | Browser (canvas-capable) | No npm install needed. Single 3KB file copied to static/. Works in all modern browsers with Canvas API. |

---

## Existing Stack (Unchanged, Not Re-Researched)

These remain exactly as-is from v1. Listed for completeness.

| Technology | Version | Role in v2 |
|------------|---------|------------|
| Node.js | >= 22 LTS | Runtime |
| TypeScript | ~5.9 | Language |
| ws | ^8.19.0 | WebSocket server (now also sends graph model JSON, not just raw .mmd) |
| @modelcontextprotocol/sdk | ^1.26.0 | MCP server (new tools: set_breakpoint, get_session, replay_session) |
| commander | ^14.0.3 | CLI |
| chokidar | ^5.0.0 | File watcher |
| zod | ^4.3.6 | Schema validation (MCP tool schemas for new observability tools) |
| tsup | ^8.5.1 | Build (server-side bundle) |
| vitest | ^4.0.18 | Tests |
| Mermaid.js | 11.x (CDN) | Fallback rendering + VS Code extension (until extension gets custom renderer) |

---

## Sources

- [elkjs npm](https://www.npmjs.com/package/elkjs) -- v0.11.0, layout engine. Verified via `npm view elkjs version`. **HIGH confidence.**
- [elkjs GitHub](https://github.com/kieler/elkjs) -- Web Worker support, JSON format, layout algorithms. **HIGH confidence.**
- [ELK JSON Format](https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/jsonformat.html) -- Official graph data structure documentation. **HIGH confidence.**
- [ELK Layout Options](https://eclipse.dev/elk/reference/options.html) -- Algorithm configuration reference. **HIGH confidence.**
- [@mermaid-js/parser npm](https://www.npmjs.com/package/@mermaid-js/parser) -- v0.6.3, AST parsing. Verified via `npm view`. **HIGH confidence.**
- [@dagrejs/dagre npm](https://www.npmjs.com/package/@dagrejs/dagre) -- v2.0.4, confirmed unmaintained. **HIGH confidence.**
- [Dagre Alternatives and Reviews](https://www.libhunt.com/r/dagre) -- Ecosystem comparison. **MEDIUM confidence.**
- [elkjs-svg GitHub](https://github.com/EmilStenstrom/elkjs-svg) -- Reference SVG renderer, 32KB. **HIGH confidence.**
- [simpleheat GitHub](https://github.com/mourner/simpleheat) -- v0.4.0, 3KB canvas heatmap. **HIGH confidence.**
- [SVG drag interaction tutorial](https://www.petercollingridge.co.uk/tutorials/svg/interactive/dragging/) -- Vanilla JS SVG drag implementation. **MEDIUM confidence.**
- [svg-drag-select GitHub](https://github.com/luncheon/svg-drag-select) -- 1.8KB, reference for select-on-drag. **MEDIUM confidence.**
- [Command Pattern undo/redo](https://www.esveo.com/en/blog/undo-redo-and-the-command-pattern/) -- Implementation patterns. **MEDIUM confidence.**
- [rrweb GitHub](https://github.com/rrweb-io/rrweb) -- Session replay reference (rejected for our use case). **HIGH confidence.**
- [Mermaid AST parsing issue #2523](https://github.com/mermaid-js/mermaid/issues/2523) -- Community discussion on AST extraction. **MEDIUM confidence.**
- [CSS SVG filter heat map](https://expensive.toys/blog/svg-filter-heat-map) -- SVG filter technique reference. **MEDIUM confidence.**
- [Interactive Debugging of Multi-Agent AI Systems (CHI 2025)](https://dl.acm.org/doi/full/10.1145/3706598.3713581) -- Breakpoint and steering patterns for AI agent debugging. **MEDIUM confidence.**
- [LangGraph Studio Debugging Guide](https://mem0.ai/blog/visual-ai-agent-debugging-langgraph-studio) -- Graph breakpoint reference implementation. **MEDIUM confidence.**

---

*Stack research for: SmartB Diagrams v2 -- Interactive Canvas + AI Observability*
*Researched: 2026-02-15*
