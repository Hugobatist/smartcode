# Architecture Patterns

**Domain:** Interactive canvas renderer + advanced AI observability features for SmartB Diagrams
**Researched:** 2026-02-15
**Confidence:** HIGH for graph model and renderer architecture (verified against dagre/elkjs docs, existing codebase patterns); MEDIUM for session recording and ghost paths (novel domain, patterns adapted from existing observability tools)

---

## Table of Contents

1. [Current Architecture Snapshot](#current-architecture-snapshot)
2. [Target Architecture](#target-architecture)
3. [New Components](#new-components)
4. [Modified Components](#modified-components)
5. [Graph Model Design](#graph-model-design)
6. [Renderer Architecture](#renderer-architecture)
7. [Bidirectional .mmd Sync](#bidirectional-mmd-sync)
8. [Session Recording Data Flow](#session-recording-data-flow)
9. [Ghost Paths and Heatmap Data Flow](#ghost-paths-and-heatmap-data-flow)
10. [WebSocket Protocol Extensions](#websocket-protocol-extensions)
11. [MCP Tool Extensions](#mcp-tool-extensions)
12. [VS Code Extension Impact](#vs-code-extension-impact)
13. [Build Order](#build-order)
14. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)

---

## Current Architecture Snapshot

```
                    SINGLE NODE.JS PROCESS
  +-----------------------------------------------------------+
  |                                                           |
  |  MCP Server    HTTP Server (3333)    File Watcher         |
  |  (stdio)       (node:http)          (chokidar)           |
  |      |              |                    |                |
  |      +------+-------+----+--------------+                |
  |             |            |                                |
  |      DiagramService   WebSocketManager                    |
  |      (read/write .mmd)  (ws, namespaces)                 |
  |             |            |                                |
  +-------------|------------|--------------------------------+
                |            |
     .mmd files on disk    WS broadcast
                             |
              +--------------+--------------+
              |                             |
        Browser (live.html)          VS Code Extension
        - Mermaid.js renders         - Mermaid.js renders
          .mmd text -> SVG             .mmd text -> SVG
        - Pan/zoom on SVG           - Flag interaction
        - Flag/status annotations   - File navigation
        - Collapse/expand (text
          manipulation + re-render)
```

### Current Data Flow (file change -> screen update)

```
.mmd file changed on disk
  -> chokidar detects change
  -> server reads file content (raw text)
  -> WebSocket broadcasts { type: 'file:changed', file, content }
  -> browser receives raw .mmd text
  -> strips annotations (%% @flag, %% @status)
  -> injects classDef styles for statuses
  -> calls mermaid.render(id, styledMermaidText)
  -> Mermaid internally: parse text -> dagre layout -> SVG generation
  -> sets #preview content to the SVG string
  -> applies pan/zoom transform
  -> overlays flag badges on SVG nodes
```

### Key Limitation: Mermaid is a Black Box

The entire rendering pipeline lives inside `mermaid.render()`. The browser receives text, hands it to Mermaid, and gets back an opaque SVG string. This means:

- **No internal graph model** -- nodes/edges exist only as text patterns or SVG DOM elements
- **No node position data** -- positions are computed by Mermaid's internal dagre, never exposed
- **No incremental updates** -- any change requires full text -> SVG re-render
- **No drag/drop** -- moving a node would require reverse-engineering SVG positions back to .mmd text
- **No heatmap overlay** -- no coordinate system to map execution counts onto
- **Collapse is text manipulation** -- the collapser.ts rewrites .mmd text, not a graph model

---

## Target Architecture

```
                    SINGLE NODE.JS PROCESS
  +-----------------------------------------------------------+
  |                                                           |
  |  MCP Server    HTTP Server (3333)    File Watcher         |
  |  (stdio)       (node:http)          (chokidar)           |
  |      |              |                    |                |
  |      +------+-------+----+--------------+                |
  |             |            |                                |
  |      DiagramService   WebSocketManager                    |
  |      + GraphModel*      (ws, namespaces)                 |
  |      + SessionStore*    + new message types*              |
  |             |            |                                |
  +-------------|------------|--------------------------------+
                |            |
     .mmd files on disk    WS broadcast
     .smartb/ session data*  |
              +--------------+--------------+
              |                             |
        Browser (live.html)          VS Code Extension
        - GraphModel (shared type)   - GraphModel (shared type)
        - Custom Renderer*           - Custom Renderer*
          (graph model -> SVG)         (graph model -> SVG)
        - InteractionManager*        - Basic interaction
        - SessionRecorder*
        - HeatmapOverlay*
        - GhostPathRenderer*

  * = NEW component
```

### Target Data Flow (file change -> screen update)

```
.mmd file changed on disk
  -> chokidar detects change
  -> server reads file content (raw text)
  -> server parses into GraphModel (nodes, edges, subgraphs, metadata)
  -> WebSocket broadcasts { type: 'graph:update', file, graph: GraphModel }
  -> browser receives GraphModel
  -> layout engine computes positions (dagre)
  -> custom renderer generates SVG from positioned graph
  -> applies pan/zoom transform
  -> overlays flags, heatmaps, ghost paths
```

### Target Data Flow (user drags node)

```
User drags node in browser
  -> InteractionManager captures drag delta
  -> updates node position in local GraphModel
  -> renderer moves SVG element (no full re-render)
  -> on drag end: GraphModel -> serialize to .mmd text
  -> POST /save with new .mmd content
  -> file watcher detects change
  -> broadcasts to other clients (loop closed)
```

---

## New Components

### 1. GraphModel (shared between server + browser)

**Location:** `src/diagram/graph-model.ts` (server) + `static/core/graph-model.js` (browser copy)
**Responsibility:** In-memory representation of a diagram's structure
**Communicates with:** DiagramService (parse/serialize), Renderer (layout/draw), InteractionManager (mutations)

The graph model is the single most important new component. It replaces "raw .mmd text as data" with a structured, queryable, mutable object.

```typescript
// src/diagram/graph-model.ts

export interface GraphNode {
  id: string;
  label: string;
  shape: 'rect' | 'rounded' | 'circle' | 'diamond' | 'hexagon' | 'stadium' | 'subroutine';
  // Position (computed by layout engine, or manually set)
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  // Metadata
  status?: NodeStatus;
  flag?: Flag;
  subgraphId?: string; // which subgraph this node belongs to
  // AI observability
  executionCount?: number;   // for heatmaps
  lastVisited?: number;      // timestamp
}

export interface GraphEdge {
  id: string;          // generated: `${from}->${to}`
  from: string;
  to: string;
  label?: string;
  type: 'arrow' | 'open' | 'dotted' | 'thick';
  // AI observability
  executionCount?: number;   // for heatmaps
  isGhostPath?: boolean;     // for alternative paths
}

export interface GraphSubgraph {
  id: string;
  label: string;
  parentId: string | null;
  nodeIds: string[];
  childSubgraphIds: string[];
  collapsed: boolean;
}

export interface GraphModel {
  diagramType: string;      // 'flowchart', 'graph', etc.
  direction: 'TB' | 'LR' | 'BT' | 'RL';
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
  subgraphs: Map<string, GraphSubgraph>;
  classDefs: Map<string, string>;  // style definitions
  // Metadata
  filePath: string;
  flags: Map<string, Flag>;
  statuses: Map<string, NodeStatus>;
  validation: ValidationResult;
}
```

**Why a class, not just an interface:** The GraphModel should be a class with mutation methods (`addNode`, `removeNode`, `moveNode`, `updateEdge`) that maintain invariants (e.g., removing a node also removes its edges). This aligns with the existing `DiagramService` pattern of encapsulating operations.

### 2. MermaidParser (enhanced parser)

**Location:** `src/diagram/mermaid-parser.ts`
**Responsibility:** Parse .mmd text into a GraphModel
**Communicates with:** DiagramService (called during readDiagram), GraphModel (produces one)

The existing `parser.ts` does minimal work (strip annotations, detect type). The existing `collapser.ts` does regex-based subgraph parsing. The new parser consolidates and extends both into a proper parser that extracts nodes, edges, subgraphs, styles, and direction.

**Approach:** Use the existing regex patterns from `collapser.ts` as a foundation but extend them to capture all node shapes, edge types, and style directives. Do NOT use `@mermaid-js/parser` because it does not support flowchart/graph diagrams (confirmed in `validator.ts` line 22-25: "v0.6 only supports info, packet, pie, architecture, gitGraph, radar and does NOT support flowchart").

```typescript
// Key exports
export function parseMermaidToGraph(content: string, filePath: string): GraphModel;
export function serializeGraphToMermaid(graph: GraphModel): string;
```

### 3. MermaidSerializer (graph -> .mmd text)

**Location:** `src/diagram/mermaid-serializer.ts`
**Responsibility:** Convert a GraphModel back to valid .mmd text
**Communicates with:** DiagramService (called during writeDiagram from visual edits)

This is the inverse of the parser. Critical for the bidirectional sync: when a user drags a node or adds an edge visually, the graph model changes and must be written back as .mmd text.

**Key design decision:** The serializer should produce clean, readable .mmd text that closely matches the original formatting. Use a "preserve original when possible" strategy -- if only positions changed (which .mmd does not encode), the text should be identical to the original.

### 4. LayoutEngine (dagre wrapper)

**Location:** `static/core/layout-engine.js`
**Responsibility:** Compute x/y positions for all nodes in a GraphModel
**Communicates with:** GraphModel (reads nodes/edges, writes positions), Renderer (positions used for SVG placement)

Use `@dagrejs/dagre` directly (the same layout engine Mermaid uses internally). This ensures visual continuity -- diagrams laid out by the custom renderer will look similar to Mermaid's output.

```javascript
// static/core/layout-engine.js

function computeLayout(graph, options) {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({
    rankdir: graph.direction || 'TB',
    nodesep: options?.nodeSep || 60,
    ranksep: options?.rankSep || 80,
    marginx: 20,
    marginy: 20,
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes with measured dimensions
  for (const [id, node] of graph.nodes) {
    g.setNode(id, {
      label: node.label,
      width: node.width || measureNodeWidth(node),
      height: node.height || measureNodeHeight(node),
    });
  }

  // Add edges
  for (const edge of graph.edges) {
    g.setEdge(edge.from, edge.to, { label: edge.label || '' });
  }

  // Add subgraph containment
  for (const [id, sg] of graph.subgraphs) {
    g.setNode(id, { label: sg.label, clusterLabelPos: 'top' });
    if (sg.parentId) g.setParent(id, sg.parentId);
    for (const nodeId of sg.nodeIds) {
      g.setParent(nodeId, id);
    }
  }

  dagre.layout(g);

  // Write positions back to graph model
  for (const [id, node] of graph.nodes) {
    const layoutNode = g.node(id);
    if (layoutNode) {
      node.x = layoutNode.x;
      node.y = layoutNode.y;
      node.width = layoutNode.width;
      node.height = layoutNode.height;
    }
  }

  return graph;
}
```

**Why dagre over elkjs:** Dagre is what Mermaid uses internally, so the visual output will be familiar. Dagre is also smaller (~30KB vs elkjs ~1.3MB). elkjs is more powerful (ports, advanced routing) but overkill for flowchart-style diagrams. If advanced layout is needed later, elkjs can be added as an alternative.

### 5. SVGRenderer (custom renderer)

**Location:** `static/core/svg-renderer.js`
**Responsibility:** Generate SVG elements from a positioned GraphModel
**Communicates with:** GraphModel (reads positioned nodes/edges), DOM (#preview element), InteractionManager (attaches event listeners)

```javascript
// static/core/svg-renderer.js

const SVGRenderer = {
  // Create or update SVG from positioned graph model
  render(graph, container) {
    const svg = this.getOrCreateSVG(container);
    this.renderNodes(svg, graph.nodes);
    this.renderEdges(svg, graph.edges);
    this.renderSubgraphs(svg, graph.subgraphs);
  },

  // Incremental update: move a single node without re-rendering everything
  moveNode(nodeId, x, y) {
    const group = this.svg.querySelector('[data-node-id="' + nodeId + '"]');
    if (group) group.setAttribute('transform', 'translate(' + x + ',' + y + ')');
    this.updateConnectedEdges(nodeId);
  },

  // Update a single node's appearance (status color, label, etc.)
  updateNode(nodeId, changes) { /* ... */ },
};
```

**Key design principles:**
- Each node is an SVG `<g>` element with `data-node-id` attribute
- Each edge is an SVG `<path>` element with `data-edge-id` attribute
- Subgraphs are SVG `<rect>` backgrounds with `<text>` labels
- Use SVG `<defs>` for arrow markers
- Support incremental updates (move/restyle single elements) without full re-render

### 6. InteractionManager (drag/select/edit)

**Location:** `static/core/interaction-manager.js`
**Responsibility:** Handle mouse/touch events for node dragging, selection, edge creation
**Communicates with:** SVGRenderer (moves elements), GraphModel (updates positions), DiagramService via HTTP (persists changes)

```javascript
// static/core/interaction-manager.js

const InteractionManager = {
  mode: null,  // null | 'drag' | 'select' | 'connect' | 'flag'

  init(svg, graph, renderer) {
    this.svg = svg;
    this.graph = graph;
    this.renderer = renderer;
    this.attachListeners();
  },

  attachListeners() {
    this.svg.addEventListener('mousedown', this.onMouseDown.bind(this));
    document.addEventListener('mousemove', this.onMouseMove.bind(this));
    document.addEventListener('mouseup', this.onMouseUp.bind(this));
  },

  onMouseDown(e) {
    const nodeEl = e.target.closest('[data-node-id]');
    if (nodeEl && this.mode !== 'flag') {
      this.startDrag(nodeEl, e);
    }
  },

  startDrag(nodeEl, e) {
    this.dragging = {
      nodeId: nodeEl.dataset.nodeId,
      startX: e.clientX,
      startY: e.clientY,
    };
  },

  onMouseMove(e) {
    if (!this.dragging) return;
    const dx = (e.clientX - this.dragging.startX) / zoom;
    const dy = (e.clientY - this.dragging.startY) / zoom;
    this.renderer.moveNode(this.dragging.nodeId, dx, dy);
  },

  onMouseUp(e) {
    if (!this.dragging) return;
    // Update graph model with final position
    // Note: .mmd files do not encode positions, so drag is ephemeral
    // until position storage is added (see .smartb/ metadata)
    this.dragging = null;
  },
};
```

**Critical architectural decision about drag persistence:** Mermaid .mmd files do NOT encode node positions -- positions are computed by the layout engine. This means dragging a node only changes the visual display for the current session. To persist drag positions, we need a sidecar metadata file (see `.smartb/` directory below). This is how tools like Excalidraw handle it.

### 7. SessionStore (server-side session data)

**Location:** `src/session/session-store.ts`
**Responsibility:** Store and retrieve session recording data, execution traces, heatmap data
**Communicates with:** DiagramService (reads diagram context), MCP tools (AI writes execution data), WebSocket (broadcasts session updates)

```typescript
// src/session/session-store.ts

export interface SessionEvent {
  timestamp: number;
  type: 'node:visited' | 'edge:traversed' | 'decision:made' | 'backtrack' | 'status:changed';
  nodeId?: string;
  edgeId?: string;
  metadata?: Record<string, unknown>;
}

export interface Session {
  id: string;
  diagramFile: string;
  startedAt: number;
  events: SessionEvent[];
  // Computed from events
  nodeVisitCounts: Map<string, number>;
  edgeTraversalCounts: Map<string, number>;
  ghostPaths: GhostPath[];
}

export interface GhostPath {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label: string;
  reason: string;  // why this path was abandoned
  timestamp: number;
}

export class SessionStore {
  private sessions: Map<string, Session> = new Map();
  private dataDir: string;  // .smartb/ in project root

  constructor(projectRoot: string) {
    this.dataDir = path.join(projectRoot, '.smartb', 'sessions');
  }

  async createSession(diagramFile: string): Promise<Session>;
  async addEvent(sessionId: string, event: SessionEvent): Promise<void>;
  async getSession(sessionId: string): Promise<Session | null>;
  async getSessionsForDiagram(diagramFile: string): Promise<Session[]>;
  async getHeatmapData(diagramFile: string): Promise<Map<string, number>>;
}
```

**Storage location:** `.smartb/sessions/` directory in the project root. JSON files, one per session. This directory should be `.gitignore`d by default (session data is ephemeral and developer-specific).

### 8. HeatmapOverlay (browser-side visualization)

**Location:** `static/overlays/heatmap-overlay.js`
**Responsibility:** Render execution count data as color intensity on nodes/edges
**Communicates with:** SVGRenderer (overlays on existing SVG), SessionStore via REST API (fetches heatmap data)

```javascript
// static/overlays/heatmap-overlay.js

const HeatmapOverlay = {
  enabled: false,
  data: new Map(),  // nodeId -> count

  async loadData(diagramFile) {
    const resp = await fetch('/api/sessions/heatmap/' + encodeURIComponent(diagramFile));
    this.data = new Map(Object.entries(await resp.json()));
  },

  apply(svg) {
    if (!this.enabled || this.data.size === 0) return;
    const maxCount = Math.max(...this.data.values());
    for (const [nodeId, count] of this.data) {
      const nodeEl = svg.querySelector('[data-node-id="' + nodeId + '"]');
      if (!nodeEl) continue;
      const intensity = count / maxCount;  // 0..1
      const color = this.intensityToColor(intensity);
      const rect = nodeEl.querySelector('rect, polygon, circle');
      if (rect) {
        rect.style.fill = color;
        rect.style.fillOpacity = String(0.3 + intensity * 0.5);
      }
    }
  },

  intensityToColor(t) {
    // Cold (blue) to hot (red) gradient
    const r = Math.round(255 * t);
    const b = Math.round(255 * (1 - t));
    return 'rgb(' + r + ', 80, ' + b + ')';
  },
};
```

### 9. GhostPathRenderer (browser-side visualization)

**Location:** `static/overlays/ghost-path-renderer.js`
**Responsibility:** Render abandoned/alternative reasoning paths as dashed/faded edges
**Communicates with:** SVGRenderer (overlays ghost edges), SessionStore via REST API (fetches ghost path data)

```javascript
// static/overlays/ghost-path-renderer.js

const GhostPathRenderer = {
  enabled: false,
  paths: [],

  async loadPaths(diagramFile) {
    const resp = await fetch('/api/sessions/ghost-paths/' + encodeURIComponent(diagramFile));
    this.paths = await resp.json();
  },

  render(svg, graph) {
    if (!this.enabled || this.paths.length === 0) return;
    const ghostGroup = this.getOrCreateGroup(svg, 'ghost-paths');
    // Clear previous ghost paths
    while (ghostGroup.firstChild) ghostGroup.removeChild(ghostGroup.firstChild);

    for (const ghost of this.paths) {
      const fromNode = graph.nodes.get(ghost.fromNodeId);
      const toNode = graph.nodes.get(ghost.toNodeId);
      if (!fromNode || !toNode) continue;

      const ns = 'http://www.w3.org/2000/svg';
      const pathEl = document.createElementNS(ns, 'path');
      pathEl.setAttribute('d', this.computeEdgePath(fromNode, toNode));
      pathEl.setAttribute('stroke', '#9ca3af');
      pathEl.setAttribute('stroke-width', '2');
      pathEl.setAttribute('stroke-dasharray', '8,4');
      pathEl.setAttribute('fill', 'none');
      pathEl.setAttribute('opacity', '0.5');
      pathEl.setAttribute('data-ghost-id', ghost.id);

      // Tooltip with reason for abandonment
      const title = document.createElementNS(ns, 'title');
      title.textContent = 'Abandoned: ' + ghost.reason;
      pathEl.appendChild(title);

      ghostGroup.appendChild(pathEl);
    }
  },
};
```

---

## Modified Components

### DiagramService (src/diagram/service.ts) -- MODIFIED

**Current:** Reads raw .mmd text, delegates parsing to simple parser/annotations modules.
**Change:** Add `readGraph()` method that returns a `GraphModel` instead of raw text. Keep existing methods for backward compatibility.

```typescript
// New method added to DiagramService
async readGraph(filePath: string): Promise<GraphModel> {
  const diagram = await this.readDiagram(filePath);
  return parseMermaidToGraph(
    diagram.mermaidContent, filePath, diagram.flags, diagram.statuses
  );
}

// New method for writing from visual edits
async writeFromGraph(filePath: string, graph: GraphModel): Promise<void> {
  const mermaidText = serializeGraphToMermaid(graph);
  await this.writeDiagram(filePath, mermaidText, graph.flags, graph.statuses);
}
```

### WebSocketManager (src/server/websocket.ts) -- MODIFIED

**Current:** Broadcasts `file:changed` with raw text content.
**Change:** Add new message types for graph model updates, session events, and heatmap data.

```typescript
// Extended WsMessage type
export type WsMessage =
  | { type: 'file:changed'; file: string; content: string }    // keep for backward compat
  | { type: 'graph:update'; file: string; graph: SerializedGraphModel }  // NEW
  | { type: 'session:event'; sessionId: string; event: SessionEvent }     // NEW
  | { type: 'heatmap:update'; file: string; data: Record<string, number> } // NEW
  | { type: 'file:added'; file: string }
  | { type: 'file:removed'; file: string }
  | { type: 'tree:updated'; files: string[] }
  | { type: 'connected'; project: string };
```

### Routes (src/server/routes.ts) -- MODIFIED

**Current:** REST API returns raw mermaid content.
**Change:** Add endpoints for graph model, sessions, heatmaps, ghost paths.

New endpoints:
- `GET /api/graph/:file` -- returns GraphModel JSON
- `POST /api/graph/:file/move` -- update node positions (persists to .smartb/ metadata)
- `POST /api/sessions` -- create a new session
- `POST /api/sessions/:id/events` -- add events to a session
- `GET /api/sessions/heatmap/:file` -- get aggregated heatmap data
- `GET /api/sessions/ghost-paths/:file` -- get ghost paths for a diagram
- `POST /api/sessions/ghost-paths` -- add a ghost path (from MCP tool)

### live.html -- MAJOR REFACTOR

**Current:** 1533 lines, monolithic. Mermaid.render() is the rendering engine.
**Change:** Replace Mermaid rendering with custom renderer. Extract inline JS into modules. live.html becomes a shell that loads modules.

Refactored structure:
```
static/
  live.html              <- reduced to ~200 lines (HTML structure + script imports)
  core/
    graph-model.js       <- shared graph model (browser copy)
    layout-engine.js     <- dagre wrapper
    svg-renderer.js      <- custom SVG generation
    interaction-manager.js <- drag/select/edit
    mermaid-fallback.js  <- optional: use Mermaid for unsupported diagram types
  overlays/
    heatmap-overlay.js   <- heatmap visualization
    ghost-path-renderer.js <- ghost path visualization
    session-player.js    <- session recording playback
  ui/
    annotations.js       <- existing, minimal changes
    collapse-ui.js       <- simplified (graph model handles collapse state)
    diagram-editor.js    <- simplified (InteractionManager handles visual editing)
    search.js            <- existing, minimal changes
    ws-client.js         <- existing, extended for new message types
  annotations.css        <- existing
  search.css             <- existing
```

### VS Code Extension webview (vscode-extension/src/webview/main.ts) -- MODIFIED

**Current:** Uses Mermaid.js to render diagrams.
**Change:** Use the same custom renderer (graph-model.js + layout-engine.js + svg-renderer.js). The webview bundles these as inline scripts or separate files included via webview URI.

---

## Graph Model Design

### Design Principles

1. **Single source of truth**: The GraphModel is THE representation of a diagram's structure. Both .mmd text and SVG are derived from it.

2. **Serializable**: The GraphModel can be JSON-serialized for WebSocket transmission and REST API responses. Use plain objects and arrays (not Map/Set) in the serialized form.

3. **Immutable-friendly mutations**: Mutation methods return new state (or mutate in place with event emission). This enables undo/redo later.

4. **Backward compatible**: The existing .mmd file format remains the canonical storage format. The GraphModel adds runtime structure on top of it but does not change what is stored on disk.

### Parse -> Model -> Serialize Round-Trip

```
Original .mmd text
  |
  v
parseMermaidToGraph()  -- parser
  |
  v
GraphModel (in memory)
  |
  v
serializeGraphToMermaid()  -- serializer
  |
  v
Reconstructed .mmd text (should be semantically identical)
```

**Round-trip fidelity requirement:** `parse(serialize(parse(text)))` must produce the same GraphModel as `parse(text)`. The serialized text does not need to be character-for-character identical to the original (whitespace/ordering may differ), but it must be semantically equivalent (same nodes, edges, subgraphs, styles).

### Position Metadata (.smartb/ sidecar)

Since .mmd files do not encode positions, user-customized positions (from drag operations) are stored in a sidecar file:

```
project-root/
  .smartb/
    positions/
      diagram-name.positions.json   <- { nodeId: { x, y } }
    sessions/
      session-id.json               <- session recording data
    .gitignore                      <- auto-generated, ignores sessions/
```

The `.smartb/positions/` data is optional. If present, the layout engine uses these positions as overrides. If absent, dagre computes positions automatically.

---

## Renderer Architecture

### Rendering Pipeline (Detailed)

```
GraphModel
  |
  v
[1] Layout Phase: dagre computes positions
  - Input: nodes with dimensions, edges, subgraph containment
  - Output: x, y coordinates on each node
  - Skipped if positions already exist (user-dragged)
  |
  v
[2] SVG Generation Phase: create SVG elements
  - Each node -> <g data-node-id="..."><rect/><text/></g>
  - Each edge -> <path data-edge-id="..."> with arrow marker
  - Subgraphs -> <rect> background + <text> label
  - Ghost paths -> dashed <path> elements
  |
  v
[3] Overlay Phase: apply visual overlays
  - Status colors (classDef styles)
  - Flag badges (red circles with "!")
  - Heatmap intensity (fill opacity)
  - Search highlights
  |
  v
[4] Interaction Phase: attach event handlers
  - Mousedown/move/up for drag
  - Click for flag mode
  - Double-click for focus mode
  - Wheel for zoom
```

### Incremental vs Full Render

Most updates should be **incremental** (update one element) rather than **full re-render** (regenerate entire SVG):

| Change | Render Strategy |
|--------|----------------|
| Node dragged | Incremental: update `<g>` transform, update connected edge paths |
| Status changed | Incremental: update `<rect>` fill color |
| Flag added/removed | Incremental: add/remove badge `<g>` |
| Heatmap toggled | Incremental: update all node fill opacities |
| Node added/removed | Full re-render (layout changes) |
| Edge added/removed | Full re-render (layout changes) |
| .mmd file changed externally | Full re-render (layout changes) |
| Subgraph collapsed/expanded | Full re-render (layout changes) |

### Mermaid Fallback Strategy

The custom renderer targets **flowchart/graph** diagrams only (the primary use case for AI observability). For other diagram types (sequence, class, state, ER, gantt, pie, gitgraph, mindmap, timeline), fall back to Mermaid.js rendering.

```javascript
function renderDiagram(graph, container) {
  if (graph.diagramType === 'flowchart' || graph.diagramType === 'graph') {
    return customRenderer.render(graph, container);
  } else {
    // Fallback to Mermaid for non-flowchart types
    return mermaidFallback.render(graph.rawMermaidContent, container);
  }
}
```

This preserves full backward compatibility while enabling interactive features for the primary diagram type.

---

## Bidirectional .mmd Sync

### Architecture Pattern: Model as Mediator

```
.mmd text on disk  <-->  GraphModel  <-->  SVG in browser
       ^                     ^                    ^
       |                     |                    |
   File System          Single Source          Visual
   (persistent)         of Truth             (ephemeral)
```

All mutations flow through the GraphModel:
- **Text edit** (editor panel): parse new text into model, re-render
- **Visual edit** (drag/add/remove): mutate model, serialize to text, save to disk
- **External change** (file watcher): read new text, parse into model, re-render
- **MCP tool** (AI): mutate via API, save to disk, file watcher broadcasts

### Conflict Resolution

When the user is dragging a node and an external change arrives:

1. **Pause sync during drag** -- buffer incoming updates
2. **On drag end** -- apply buffered updates, re-parse if structural changes occurred
3. **Structural vs cosmetic** -- if the incoming change only affects statuses/flags (not nodes/edges), merge without interrupting. If structural, full re-render.

### Debounce Strategy

The existing system re-renders on every file change. With the custom renderer + layout, this is more expensive. Apply debouncing:

- File changes: 50ms debounce (matches current WS latency target)
- Editor typing: 300ms debounce (user is still typing)
- Drag position updates: 0ms (immediate SVG moves, no layout or save)
- Drag end save: 0ms (save immediately on mouseup)

---

## Session Recording Data Flow

```
AI Tool (via MCP)                    Browser
  |                                    |
  | record_event tool                  | Session Player UI
  |----> MCP Server                    |
  |        |                           |
  |        v                           |
  |    SessionStore                    |
  |    (writes to .smartb/sessions/)   |
  |        |                           |
  |        v                           |
  |    WebSocket broadcast             |
  |    { type: 'session:event', ... }  |
  |        |                           |
  |        +-------------------------->|
  |                                    |
  |                              Session Player
  |                              - shows current step
  |                              - highlights active node
  |                              - animates transitions
```

### MCP Tools for Session Recording

New MCP tools that AI agents call to record their reasoning:

```typescript
// New tools to register in src/mcp/tools.ts

// Tool: start_session
// Input: { diagramFile: string }
// Output: { sessionId: string }

// Tool: record_step
// Input: { sessionId: string, nodeId: string, action: string, metadata?: object }
// Output: { ok: true }

// Tool: record_ghost_path
// Input: { sessionId: string, fromNodeId: string, toNodeId: string, reason: string }
// Output: { ok: true }

// Tool: end_session
// Input: { sessionId: string }
// Output: { summary: { nodesVisited: number, edgesTraversed: number, ghostPaths: number } }
```

---

## Ghost Paths and Heatmap Data Flow

### Ghost Paths (alternative reasoning paths the AI considered but abandoned)

```
AI decides NOT to take path A -> B
  |
  v
Calls record_ghost_path(sessionId, "A", "B", "Requirement changed")
  |
  v
SessionStore saves ghost path event
  |
  v
WebSocket broadcasts to browser
  |
  v
GhostPathRenderer draws dashed edge from A to B
with tooltip: "Abandoned: Requirement changed"
```

### Heatmap Data (execution frequency visualization)

```
AI visits node "step_3" for the 5th time
  |
  v
Calls record_step(sessionId, "step_3", "revisit")
  |
  v
SessionStore increments visit count for step_3
  |
  v
WebSocket broadcasts { type: 'heatmap:update', data: { step_3: 5 } }
  |
  v
HeatmapOverlay updates step_3's fill opacity from 0.3 to 0.8
(cold blue -> warm red gradient based on relative frequency)
```

### Data Aggregation

Heatmap data is aggregated across all sessions for a given diagram file. The REST endpoint `GET /api/sessions/heatmap/:file` returns:

```json
{
  "step_1": 12,
  "step_2": 8,
  "step_3": 5,
  "step_4": 1,
  "decision_point": 15
}
```

The browser normalizes these counts to 0..1 range for color mapping.

---

## WebSocket Protocol Extensions

### New Message Types

| Message Type | Direction | Payload | Purpose |
|-------------|-----------|---------|---------|
| `graph:update` | Server -> Client | `{ file, graph: SerializedGraphModel }` | Full graph model update (replaces `file:changed` for custom renderer clients) |
| `session:event` | Server -> Client | `{ sessionId, event: SessionEvent }` | Real-time session recording event |
| `heatmap:update` | Server -> Client | `{ file, data: Record<string, number> }` | Incremental heatmap count update |
| `ghost:added` | Server -> Client | `{ file, ghostPath: GhostPath }` | New ghost path added |
| `node:moved` | Client -> Server | `{ file, nodeId, x, y }` | User dragged a node (future) |

### Backward Compatibility

The existing `file:changed` message continues to be sent alongside `graph:update`. This ensures:
- VS Code extension works without changes initially
- Browser UI can fall back to Mermaid rendering for unsupported types
- Third-party consumers of the WebSocket API continue to work

New clients should prefer `graph:update` when available. The server sends both during the transition period.

---

## MCP Tool Extensions

### New Tools

| Tool | Input | Purpose |
|------|-------|---------|
| `start_session` | `{ diagramFile }` | Begin recording AI reasoning session |
| `record_step` | `{ sessionId, nodeId, action, metadata? }` | Record a step in the reasoning process |
| `record_ghost_path` | `{ sessionId, fromNodeId, toNodeId, reason }` | Record an abandoned reasoning path |
| `end_session` | `{ sessionId }` | End recording, compute summary |
| `get_heatmap` | `{ diagramFile }` | Get aggregated visit counts |
| `get_sessions` | `{ diagramFile }` | List all sessions for a diagram |

### Existing Tools (unchanged)

All 5 existing MCP tools (`update_diagram`, `read_flags`, `get_diagram_context`, `update_node_status`, `get_correction_context`) remain unchanged. They continue to work on .mmd text and the DiagramService handles the translation.

---

## VS Code Extension Impact

### Phase 1: No Changes (Mermaid fallback)

Initially, the VS Code extension continues using Mermaid.js for rendering. The existing WebSocket messages (`file:changed`) still work. This means the extension gets none of the interactive features (drag, heatmap, ghost paths) but remains functional.

### Phase 2: Shared Renderer

When the custom renderer is stable, the VS Code webview is updated to use it:

1. Bundle `graph-model.js`, `layout-engine.js`, `svg-renderer.js` as webview assets
2. Listen for `graph:update` WS messages instead of `file:changed`
3. Render using custom renderer instead of Mermaid
4. Add heatmap overlay toggle to webview UI

**Key constraint:** The VS Code webview is sandboxed. It cannot load npm packages directly. The renderer modules must be browser-compatible vanilla JS (which they are, since they also run in live.html).

### Phase 3: Interactive Features in VS Code

Add interaction capabilities to the VS Code webview:
- Click-to-flag (already exists)
- Heatmap overlay toggle
- Ghost path visibility toggle
- Session replay controls (play/pause/step)

Drag-and-drop is intentionally NOT added to VS Code (the sidebar panel is too small for meaningful node dragging; that is a browser-only feature).

---

## Build Order

The dependency chain dictates this build order. Each step produces a usable intermediate state.

### Step 1: Graph Model + Parser + Serializer (server-side)

**Build:** `graph-model.ts`, `mermaid-parser.ts`, `mermaid-serializer.ts`
**Test:** Round-trip: parse -> model -> serialize -> parse -> compare
**Depends on:** Nothing new (uses existing types and patterns)
**Validates:** .mmd parsing correctness, model completeness
**Outcome:** Server can produce GraphModel from .mmd files

### Step 2: Layout Engine (browser-side)

**Build:** `layout-engine.js` (dagre wrapper)
**Test:** Layout a simple graph, verify positions are reasonable
**Depends on:** Step 1 (GraphModel type definition)
**Validates:** dagre integration, position computation
**Outcome:** Browser can compute node positions from a GraphModel

### Step 3: SVG Renderer (browser-side)

**Build:** `svg-renderer.js`
**Test:** Render a positioned graph to SVG, compare visually with Mermaid output
**Depends on:** Steps 1 + 2
**Validates:** SVG generation, visual correctness
**Outcome:** Browser can render a diagram without Mermaid

### Step 4: Integration (wire up server + browser)

**Build:** New REST endpoint (`/api/graph/:file`), update WS to send `graph:update`, update live.html to use custom renderer
**Test:** File change -> graph model -> WS -> browser render (end-to-end)
**Depends on:** Steps 1-3
**Validates:** Full data flow works
**Outcome:** live.html renders diagrams using custom renderer

### Step 5: Interaction Manager (drag/select)

**Build:** `interaction-manager.js`, position metadata `.smartb/positions/`
**Test:** Drag a node, verify it moves, verify edges update
**Depends on:** Step 4
**Validates:** Drag mechanics, edge re-routing
**Outcome:** Users can drag nodes in the browser

### Step 6: live.html Refactor

**Build:** Extract inline JS from live.html into modules, reduce to ~200 line shell
**Test:** All existing features still work (regression)
**Depends on:** Step 4 (custom renderer is in place)
**Validates:** No regressions from refactor
**Outcome:** live.html is maintainable, under 500 lines

### Step 7: Session Store + MCP Tools

**Build:** `session-store.ts`, new MCP tools, new REST endpoints
**Test:** AI agent records a session via MCP, data persists in .smartb/
**Depends on:** Step 4 (graph model exists for node references)
**Validates:** Session recording, data persistence
**Outcome:** AI agents can record reasoning sessions

### Step 8: Heatmap + Ghost Path Overlays

**Build:** `heatmap-overlay.js`, `ghost-path-renderer.js`
**Test:** Session data renders as visual overlays
**Depends on:** Steps 3 + 7
**Validates:** Visual overlays, color mapping
**Outcome:** Users can see AI reasoning patterns visually

### Step 9: VS Code Extension Update

**Build:** Update webview to use custom renderer, add overlay toggles
**Test:** Diagram renders in VS Code sidebar with custom renderer
**Depends on:** Steps 3 + 4 (renderer is stable)
**Validates:** Webview integration, asset bundling
**Outcome:** VS Code extension uses custom renderer

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Dual Source of Truth
**What:** Keeping both .mmd text AND GraphModel as independent sources that can diverge.
**Why bad:** Leads to sync bugs where visual state disagrees with file content.
**Instead:** GraphModel is always derived from .mmd text. Mutations go through model -> serialize -> save -> re-parse loop. The .mmd file is the persistent source of truth; the GraphModel is a runtime projection.

### Anti-Pattern 2: Direct SVG DOM Manipulation for Structural Changes
**What:** Adding/removing nodes by directly creating/deleting SVG elements without updating the GraphModel.
**Why bad:** The SVG becomes inconsistent with the model. Next full render will "undo" the visual change.
**Instead:** All structural changes (add/remove node/edge) go through GraphModel first, then re-render. Only cosmetic changes (drag position, highlight) can be applied directly to SVG.

### Anti-Pattern 3: Blocking Layout in the Render Loop
**What:** Computing dagre layout synchronously in the main thread on every update.
**Why bad:** dagre layout for 100+ nodes can take 50-200ms, causing visible jank.
**Instead:** Use requestAnimationFrame or a Web Worker for layout computation. Cache layout results and only recompute when the graph structure changes (not on cosmetic updates).

### Anti-Pattern 4: Sending Full GraphModel on Every WS Update
**What:** Broadcasting the entire serialized GraphModel (could be 50KB+) on every file change.
**Why bad:** Wastes bandwidth, causes slow updates for large diagrams.
**Instead:** Send deltas when possible (node added, edge removed). Fall back to full model only when needed (initial load, major restructure).

### Anti-Pattern 5: Coupling Session Data to .mmd Files
**What:** Storing heatmap counts and ghost paths inside the .mmd file as annotations.
**Why bad:** Pollutes the diagram source with runtime data. AI tools would need to re-write the file constantly. Multiple sessions would conflict.
**Instead:** Session data lives in `.smartb/` sidecar directory. The .mmd file contains only diagram structure and flags/statuses.

### Anti-Pattern 6: Building Custom Renderer for All Diagram Types
**What:** Implementing custom renderers for sequence diagrams, ER diagrams, gantt charts, etc.
**Why bad:** Massive scope expansion. These diagram types have fundamentally different layout algorithms. Mermaid handles them well.
**Instead:** Custom renderer for flowchart/graph only. Mermaid fallback for everything else. This covers the primary AI observability use case.

---

## Scalability Considerations

| Concern | At 50 nodes | At 200 nodes | At 1000 nodes |
|---------|-------------|--------------|---------------|
| Layout time | <10ms (dagre) | 50-100ms (dagre) | 500ms+ (consider Web Worker) |
| SVG render | <5ms | 20-50ms | 100ms+ (virtualize off-screen nodes) |
| WS payload | ~5KB | ~20KB | ~100KB (use delta updates) |
| Session events | In-memory | In-memory + periodic flush | Stream to disk immediately |
| Heatmap overlay | Direct apply | Direct apply | Batch apply with requestAnimationFrame |

### Web Worker Strategy (for 200+ nodes)

Move layout computation to a Web Worker to avoid blocking the main thread:

```javascript
// layout-worker.js
self.onmessage = function(e) {
  var graph = e.data.graph;
  var options = e.data.options;
  var positioned = computeLayout(graph, options);
  self.postMessage({ graph: positioned });
};
```

The main thread sends the graph model to the worker, and receives positioned results asynchronously. The renderer applies positions when available.

---

## Sources

- [dagrejs/dagre - GitHub](https://github.com/dagrejs/dagre) -- layout algorithm
- [dagre API Reference](https://github.com/dagrejs/dagre/wiki) -- dagre graph API
- [graphlib API Reference](https://github.com/dagrejs/graphlib/wiki/API-Reference) -- underlying graph library
- [kieler/elkjs - GitHub](https://github.com/kieler/elkjs) -- alternative layout engine (not recommended for initial implementation)
- [ELK JSON Format](https://eclipse.dev/elk/documentation/tooldevelopers/graphdatastructure/jsonformat.html) -- elkjs I/O format reference
- [@mermaid-js/parser - npm](https://www.npmjs.com/package/@mermaid-js/parser) -- official parser (does NOT support flowchart)
- [Mermaid Layout Engines](https://mermaid.ai/open-source/config/layouts.html) -- how Mermaid uses dagre internally
- [SVG Interactive Dragging](https://www.petercollingridge.co.uk/tutorials/svg/interactive/dragging/) -- vanilla JS SVG drag pattern
- [Graphviz Visual Editor](https://deepwiki.com/magjac/graphviz-visual-editor) -- bidirectional text/visual editor reference
- [Terrastruct D2](https://terrastruct.com/) -- bidirectional diagram editor reference architecture
- [ReTrace: Interactive Visualizations for Reasoning Traces](https://arxiv.org/pdf/2511.11187) -- AI reasoning trace visualization
