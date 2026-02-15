# Roadmap: SmartB Diagrams

## Milestone v1.0 (Complete)

All 8 phases completed on 2026-02-15. See `.planning/phases/` for details.

## Milestone v2.0: Interactive Canvas + AI Observability

### Overview

v2.0 replaces Mermaid.js as a black-box renderer with a custom interactive SVG pipeline. The roadmap follows a strict dependency chain: refactor the monolithic live.html first, then build the graph model and custom renderer, then add canvas interactions, then AI observability features, and finally advanced replay capabilities. Each phase delivers a coherent, independently verifiable capability that unblocks the next.

### Phases

- [ ] **Phase 9: Foundation Refactoring** - Extract live.html into modules, DOM abstraction layer, event bus
- [x] **Phase 10: Graph Model + Parser** - Internal graph model types, .mmd parser, serializer, round-trip tests (completed 2026-02-15)
- [x] **Phase 11: Custom Renderer** - dagre layout engine, SVG renderer, parallel rendering mode, feature parity gate (completed 2026-02-15)
- [ ] **Phase 12: Server + Browser Integration** - Graph API endpoint, WebSocket graph:update, live.html integration, Mermaid fallback
- [ ] **Phase 13: Canvas Interactions** - Node selection, context menu, inline edit, keyboard shortcuts
- [ ] **Phase 14: Undo/Redo + Edit Actions** - Command pattern, copy/paste/duplicate, folder management
- [ ] **Phase 15: AI Breakpoints + Ghost Paths** - Breakpoint annotations, ghost path rendering, MCP tools
- [ ] **Phase 16: Heatmap + Session Recording** - Risk heatmap overlay, session store, session replay UI

### Phase Details

#### Phase 9: Foundation Refactoring
**Goal**: live.html is split into < 500-line modules with proper event bus communication, and a DOM abstraction layer decouples interaction code from Mermaid's SVG DOM structure
**Depends on**: v1.0 complete
**Success Criteria** (what must be TRUE):
  1. live.html is under 300 lines (HTML shell + script imports only)
  2. All existing features work identically (flags, search, collapse, export, file tree, pan/zoom, editor)
  3. Each extracted module is under 500 lines
  4. Modules communicate via an event bus, not window.* globals
  5. A DiagramDOM abstraction layer provides findNode/getNodeBBox/getNodeLabel without Mermaid-specific queries
  6. All 131 existing tests still pass
**Plans:** 4 plans

Plans:
- [ ] 09-01-PLAN.md — Extract event-bus.js, diagram-dom.js, and main.css from live.html
- [ ] 09-02-PLAN.md — Extract renderer.js, pan-zoom.js, and export.js from live.html
- [ ] 09-03-PLAN.md — Extract file-tree.js, editor-panel.js, app-init.js; finalize HTML shell
- [ ] 09-04-PLAN.md — Migrate existing modules to DiagramDOM + event bus; human verification

#### Phase 10: Graph Model + Parser
**Goal**: The server can parse any .mmd flowchart file into a structured GraphModel and serialize it back with round-trip fidelity
**Depends on**: Phase 9
**Success Criteria** (what must be TRUE):
  1. GraphModel types (GraphNode, GraphEdge, GraphSubgraph) are defined and exported
  2. parseMermaidToGraph() handles all flowchart node shapes, edge types, subgraphs, styles, and annotations
  3. serializeGraphToMermaid() produces semantically equivalent .mmd text (parse(serialize(parse(text))) === parse(text))
  4. Round-trip tests cover 20+ .mmd fixtures including nested subgraphs, special characters, and all edge types
  5. Existing .mmd files with flags and statuses parse correctly into the graph model
**Plans:** 3/3 plans complete

Plans:
- [ ] 10-01-PLAN.md — Define GraphModel types and create 22 .mmd test fixtures
- [ ] 10-02-PLAN.md — TDD: parseMermaidToGraph() with multi-pass pipeline
- [ ] 10-03-PLAN.md — TDD: serializeGraphToMermaid(), round-trip tests, DiagramService integration

#### Phase 11: Custom Renderer
**Goal**: The browser can render a flowchart diagram from a GraphModel using dagre layout and custom SVG, producing output visually similar to Mermaid
**Depends on**: Phase 10
**Success Criteria** (what must be TRUE):
  1. dagre computes node positions from GraphModel (nodes, edges, subgraphs)
  2. Custom SVG renderer generates `<g data-node-id>` elements for each node with correct shapes
  3. Edges render as SVG `<path>` elements with arrow markers
  4. Subgraphs render as background rectangles with labels
  5. A `?renderer=custom` query param toggles between Mermaid and custom renderer
  6. ViewportTransform class correctly converts screen ↔ graph coordinates at all zoom levels
**Plans:** 4 plans

Plans:
- [ ] 11-01-PLAN.md -- Graph API endpoint + dagre layout + viewport transform
- [ ] 11-02-PLAN.md -- SVG shapes (13 shapes) + SVG renderer
- [ ] 11-03-PLAN.md -- Custom renderer orchestrator + live.html integration + toggle + DiagramDOM
- [ ] 11-04-PLAN.md -- TDD: ViewportTransform + dagre layout tests

#### Phase 12: Server + Browser Integration
**Goal**: The full data flow works end-to-end: file change → server parses to GraphModel → WebSocket sends graph JSON → browser renders with custom renderer
**Depends on**: Phase 11
**Success Criteria** (what must be TRUE):
  1. GET /api/graph/:file returns GraphModel JSON
  2. WebSocket sends `graph:update` messages alongside existing `file:changed` (backward compat)
  3. live.html uses custom renderer for flowchart diagrams, Mermaid fallback for others
  4. All existing interactions (flags, search, collapse, export) work with the custom renderer via DiagramDOM abstraction
  5. Status colors, flag badges, and search highlights render correctly on custom SVG
**Plans:** TBD

#### Phase 13: Canvas Interactions
**Goal**: Developers can select nodes, right-click for context menu, double-click to edit labels inline, and use keyboard shortcuts for diagram manipulation
**Depends on**: Phase 12
**Success Criteria** (what must be TRUE):
  1. Clicking a node selects it with a visual indicator (blue border, corner handles)
  2. Right-clicking a node shows a context menu with Edit, Delete, Duplicate, Flag, Connect actions
  3. Double-clicking a node label opens an inline contenteditable overlay for editing
  4. Delete/Backspace removes selected node and its edges, with .mmd file updated
  5. Escape deselects; clicking empty space deselects
  6. Interaction state machine prevents conflicts (can't flag while editing, can't pan while selecting)
**Plans:** TBD

#### Phase 14: Undo/Redo + Edit Actions
**Goal**: All diagram edit operations are undoable, and developers can copy/paste/duplicate nodes
**Depends on**: Phase 13
**Success Criteria** (what must be TRUE):
  1. Ctrl+Z undoes the last user action; Ctrl+Shift+Z redoes
  2. Undo stack only tracks user actions, not AI/filesystem changes
  3. Ctrl+C copies selected node(s); Ctrl+V pastes with new IDs and offset position
  4. Ctrl+D duplicates selected node(s) in place
  5. Folder rename and delete work from file tree context menu
  6. Command history is capped at 100 entries
**Plans:** TBD

#### Phase 15: AI Breakpoints + Ghost Paths
**Goal**: Developers can set breakpoints on diagram nodes that pause AI execution, and discarded reasoning branches appear as ghost paths
**Depends on**: Phase 12 (custom renderer required for ghost path rendering)
**Success Criteria** (what must be TRUE):
  1. `%% @breakpoint NodeId` annotation marks a node as a breakpoint with visual indicator (red circle)
  2. MCP tool `check_breakpoints()` returns "pause" when AI reaches a breakpoint node
  3. Browser shows notification bar: "Breakpoint hit on Node X. [Continue] [Remove]"
  4. Ghost paths (discarded reasoning branches) render as dashed edges at 30% opacity
  5. A toggle button shows/hides ghost paths
  6. MCP tool `record_ghost_path()` allows AI to log abandoned paths
**Plans:** TBD

#### Phase 16: Heatmap + Session Recording
**Goal**: Developers can see AI reasoning patterns as a heatmap overlay and replay how a diagram evolved over time
**Depends on**: Phase 15
**Success Criteria** (what must be TRUE):
  1. `%% @risk NodeId high|medium|low "reason"` annotation adds risk level to nodes
  2. Heatmap mode colors nodes by execution frequency (cold blue → hot red)
  3. Session events are recorded as JSONL in `.smartb/sessions/`
  4. MCP tools `start_session`, `record_step`, `end_session` allow AI to record reasoning
  5. Timeline scrubber UI replays diagram evolution at 1x/2x/4x speed
  6. Diff highlighting shows added (green), removed (red), modified (yellow) nodes between frames
**Plans:** TBD

### Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 9. Foundation Refactoring | 4/4 | Complete | 2026-02-15 |
| 10. Graph Model + Parser | 3/3 | Complete    | 2026-02-15 |
| 11. Custom Renderer | 4/4 | Complete | 2026-02-15 |
| 12. Server + Browser Integration | 0/? | Not Started | - |
| 13. Canvas Interactions | 0/? | Not Started | - |
| 14. Undo/Redo + Edit Actions | 0/? | Not Started | - |
| 15. AI Breakpoints + Ghost Paths | 0/? | Not Started | - |
| 16. Heatmap + Session Recording | 0/? | Not Started | - |
