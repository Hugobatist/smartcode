# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** Developers can see what their AI is thinking and intervene surgically before it finishes

## Current Position

Phase: 15-ai-breakpoints-ghost-paths
Plan: 02 of 03 complete
Status: Plan 02 complete -- MCP tools for breakpoints and ghost paths
Last activity: 2026-02-16 -- Plan 02 executed (2 tasks, 3min), 238 tests passing

Progress: [██████████] v1.0 100% | Phase 15: [======----] 2/3 plans complete

## v1.0 Performance Metrics

**Velocity:**
- Total plans completed: 23
- Total phases completed: 8/8

**By Phase:**

| Phase | Plans | Status |
|-------|-------|--------|
| 01-project-bootstrap-diagram-core | 2/2 | Complete |
| 02-http-server | 2/2 | Complete |
| 03-websocket-real-time-sync | 3/3 | Complete |
| 04-interactive-browser-ui | 2/2 | Complete |
| 05-mcp-server | 3/3 | Complete |
| 06-cli-dx-ai-integration | 3/3 | Complete |
| 07-vscode-extension | 4/4 | Complete |
| 08-scalability-large-diagrams | 3/3 | Complete |

## Phase 9 Progress

**09-01 (Complete):** EventBus pub/sub, DiagramDOM SVG abstraction, CSS extraction
- live.html reduced from 1757 to 1190 lines (32% reduction)
- 3 new files: event-bus.js, diagram-dom.js, main.css
- All 131 tests pass

**09-02 (Complete):** Renderer, pan-zoom, export extraction
- live.html reduced from 1190 to 721 lines (39% reduction, 469 lines removed)
- 3 new files: renderer.js, pan-zoom.js, export.js
- Shared MERMAID_CONFIG eliminates triple config duplication in exportPNG
- EventBus integration: diagram:rendered and diagram:error events
- All 131 tests pass

**09-03 (Complete):** File tree, editor panel, app init extraction
- live.html reduced from 721 to 144 lines (80% reduction, 577 lines removed)
- 3 new files: file-tree.js, editor-panel.js, app-init.js
- State centralized: currentFile/lastContent in SmartBFileTree, autoSync in SmartBEditorPanel
- _initHooks rewired to module APIs
- Primary success criterion achieved: live.html is pure HTML shell (zero inline JS/CSS)
- All 131 tests pass

**09-04 (Complete):** Module migration to DiagramDOM + event bus
- 4 modules migrated: annotations.js, collapse-ui.js, search.js, diagram-editor.js
- All Mermaid SVG patterns (`flowchart-*`, `subGraph*`) consolidated in diagram-dom.js only
- Event bus subscriptions: all 4 modules subscribe to `diagram:rendered`
- Event bus emissions: `flags:changed`, `diagram:edited`, `search:results`, `search:match-selected`
- innerHTML replaced with DOM-safe createElement methods
- All public APIs preserved, hooks pattern kept for backward compat
- All 131 tests pass, all files under 500 lines

## Phase 10 Progress

**10-01 (Complete):** GraphModel type system and test fixtures
- src/diagram/graph-types.ts: 83 lines, 9 exports (NodeShape, EdgeType, FlowDirection, GraphNode, GraphEdge, GraphSubgraph, GraphModel, SHAPE_PATTERNS, EDGE_SYNTAX)
- 22 .mmd fixture files in test/fixtures/graph/ covering all syntax features
- Zero new dependencies, typecheck passes, all 131 tests pass
- Duration: 2 min

**10-02 (Complete):** parseMermaidToGraph multi-pass parser (TDD)
- src/diagram/graph-parser.ts (350 lines) + src/diagram/graph-edge-parser.ts (230 lines)
- 7-pass pipeline: preprocessing, direction, styles, subgraphs, nodes, edges, validation
- 30 new tests across 8 groups, all 161 tests pass (131 existing + 30 new)
- Handles all 13 shapes, 5 edge types, subgraphs, styles, annotations, edge cases
- Duration: 7 min

**10-03 (Complete):** serializeGraphToMermaid + round-trip fidelity + integration
- src/diagram/graph-serializer.ts (188 lines): canonical output order, all 13 shapes, 5 edge types
- Round-trip fidelity proven for all 22 fixtures: parse(serialize(parse(text))) === parse(text)
- DiagramService.readGraph() method, public API exports in index.ts
- 40 new tests, all 201 tests pass (161 existing + 40 new)
- Duration: 4 min

## Phase 8 Summary

All scalability features implemented:
- **08-01**: Subgraph parsing, collapse/expand system, collapse-ui.js (by OpenClaw)
- **08-02**: Auto-collapse to 50 node limit, notice UI, server route integration
- **08-03**: Breadcrumb navigation, focus mode (double-click), Escape to exit

Code review of OpenClaw's work found 5 critical bugs — all fixed before continuing.

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

**Carried from v1.0:**
- Node.js built-in http.createServer with thin router (no framework)
- chokidar v5 for file watching
- WebSocket for real-time sync
- tsup for build, vitest for tests
- ESM-only project

**Phase 9:**
- EventBus via native EventTarget API (WeakMap for handler tracking)
- DiagramDOM abstraction — always re-query SVG, never cache references
- main.css as first stylesheet to preserve CSS cascade order
- isInitialRender state in renderer.js (render-related, not pan-zoom)
- SmartBRenderer.MERMAID_CONFIG shared to eliminate config duplication
- window.currentFile kept in sync for cross-module access
- currentFile/lastContent state centralized in SmartBFileTree with getters/setters
- autoSync state centralized in SmartBEditorPanel with isAutoSync getter
- _initHooks delegation to module APIs (SmartBFileTree, SmartBPanZoom, SmartBRenderer)
- app-init.js loads last as bootstrap/orchestration module
- Hooks pattern + event bus coexistence for backward compat during migration
- DiagramDOM.extractNodeId delegates from SmartBAnnotations.extractNodeId public API
- DOM-safe createElement for popover construction instead of innerHTML

**Phase 10:**
- Separate graph-types.ts file — backward compatibility for existing DiagramNode/DiagramEdge
- SHAPE_PATTERNS ordered longest-first for correct parsing precedence
- Map<K,V> for all GraphModel collections — consistent with DiagramContent.flags pattern
- Trapezoid vs parallelogram disambiguation via close bracket character
- Parser split into graph-parser.ts (orchestration) + graph-edge-parser.ts (helpers) for 500-line limit
- Edge operators ordered by specificity: bidirectional, labeled, simple -- prevents partial matches
- Implicit nodes get shape 'rect' and label equal to ID
- Bare ID:::className handled in node-definition pass for inline class assignment
- Canonical serialization order: direction, classDefs, subgraphs+nodes, root nodes, edges, styles, linkStyles, class assignments
- Bare ID optimization in serializer: label===id + shape==='rect' emits without brackets
- SHAPE_BRACKETS reverse map from SHAPE_PATTERNS, first-match-wins for disambiguation
- Class assignments grouped by class name for compact serializer output

**Phase 14:**
- Content-snapshot command pattern ({before, after, description}) over fine-grained operation commands -- simpler since applyEdit() handles annotation pipeline
- MAX_HISTORY=100 (doubled from old MAX_UNDO=50) -- .mmd files small, 100 snapshots under 1MB
- Redo stack clears on new edit (standard editor behavior)
- history:changed event emitted via SmartBEventBus for future UI indicator integration
- Popover extraction to editor-popovers.js to keep diagram-editor.js under 500 lines
- editor-popovers.js accesses MmdEditor via window.MmdEditor (script load order enforces availability)
- Reuse POST /move for folder rename -- fs.rename works on directories natively, no new endpoint needed
- Folder delete confirmation dialog shows file count from treeData before proceeding
- Folder buttons use same CSS classes (rename-btn, delete-btn) as file buttons for consistent styling
- Internal JS buffer for clipboard instead of browser Clipboard API (localhost not HTTPS)
- Ctrl+C only prevents default if node was actually copied -- browser text copy still works
- Ctrl+D always prevents default to block browser bookmark dialog
- Contenteditable guard added alongside existing textarea/flag-popover/search-bar guards

**Phase 13:**
- Object literal transition table FSM over XState library — 8 states max, no need for 30KB dependency
- SVG overlay group for selection indicators — re-created on each render via diagram:rendered event
- No corner handles for edge selection — edges get CSS class highlight (.selected-edge) only
- PAN_THRESHOLD = 3px — balances click detection vs pan responsiveness
- Click handler uses DiagramDOM.extractNodeId directly — no timer for click/dblclick disambiguation
- FSM coordination pattern: all interaction modules query SmartBInteraction before acting
- Flag action in context menu activates flag mode (toggleFlagMode) instead of directly showing popover — avoids modifying annotations.js
- Inline edit uses blur-as-confirm with setTimeout(0) guard to prevent accidental commits
- Collapse-ui FSM guards: click checks editing/context-menu, dblclick checks editing/selected
- Mode toggle FSM sync: after calling toggleX(), forceState based on resulting module state

**Phase 15:**
- Three-annotation preservation: every write operation reads and re-injects flags, statuses, AND breakpoints
- GhostPathStore and breakpointContinueSignals created in createHttpServer, exposed on ServerInstance
- buildFileTree extracted to file-tree.ts to keep routes.ts under 500 lines after adding breakpoint routes
- POST /api/breakpoints/:file/continue registered BEFORE general breakpoints route for pattern specificity
- Ghost paths stored in-memory per file (no disk persistence -- session-scoped data)
- Breakpoint annotation format: %% @breakpoint NodeId (alongside existing @flag and @status)
- Optional deps pattern for registerTools: ghostStore/wsManager/continueSignals via options object
- createMcpServer deferred after HTTP server init when --serve so deps are available
- broadcastAll for breakpoint/ghost messages (cross-cutting, not project-scoped)
- Tests exercise DiagramService/GhostPathStore directly (not MCP protocol integration)

### Pre-Release Todos Status

**RESOLVED (by Phase 8 agents):**
1. ~~Mermaid `securityLevel: 'loose'`~~ — Changed to `'sandbox'` (4 occurrences in live.html)
2. ~~`readJsonBody` sem limite de tamanho~~ — Added MAX_BODY_SIZE 1MB limit
3. ~~`nodeId` sem escape no innerHTML do flag panel~~ — Applied escapeHtml
4. ~~`onclick` inline com string interpolation~~ — Replaced with addEventListener
5. ~~Race condition em `setFlag/removeFlag`~~ — Added per-file write lock

**STILL PENDING:**
6. `addProject` nao registra rotas REST para projetos adicionais
7. Zero testes para frontend
8. `KNOWN_DIAGRAM_TYPES` duplicado entre parser.ts e validator.ts
9. Logica de parsing duplicada entre backend (annotations.ts) e frontend (annotations.js)
10. ~~`live.html` com 721 linhas~~ — Reduced to 144 lines (pure HTML shell, zero inline JS/CSS) in 09-03
11. Watchers de projetos adicionais nunca fechados no shutdown
12. Static file path traversal check menos rigorosa
13. Sem testes para rotas POST, WebSocketManager, FileWatcher
14. ~~Bug no drag & drop — `knownFiles` e `renderFileList` nao existem~~ — Fixed in 09-02 (replaced with refreshFileList)
15. Deps nao utilizadas: `fast-glob` e `@mermaid-js/parser`
16. Versao hardcoded em `cli.ts` e `mcp/server.ts`
17. `refreshFileList` redundante quando dados ja vem via WebSocket
18. Mistura de `var`/`let`/`const` no frontend

### Test Coverage

- 238 tests passing across 18 test files
- Key coverage: collapser (42 tests), graph-parser (30), annotations (28), graph-roundtrip (25), graph-serializer (15), server (13), viewport-transform (11), service (11), dagre-layout (9), parser (9), breakpoint-tools (7)
- Gaps: no frontend tests, no POST route tests

## Phase 11 Progress

**11-01 (Complete):** Graph API endpoint + dagre-layout.js + viewport-transform.js
- GET /api/graph/:file endpoint in routes.ts (389 lines) — Maps→plain objects for JSON
- dagre-layout.js (283 lines): computeLayout with text measurement, shape sizing, subgraph support
- viewport-transform.js (107 lines): screenToGraph/graphToScreen, zoomToFit

**11-02 (Complete):** SVG shapes + SVG renderer
- svg-shapes.js (218 lines): all 13 Mermaid node shapes as SVG factories, geometry-only
- svg-renderer.js (279 lines): createSVG from LayoutResult, data-* attributes, arrow markers, theme

**11-03 (Complete, human verify pending):** Custom renderer orchestrator + integration
- custom-renderer.js (92 lines): render(graphModel) + fetchAndRender(filePath)
- live.html (150 lines): dagre CDN + 5 new script tags
- app-init.js (304 lines): ?renderer=custom toggle, renderWithType wrapper, CUSTOM indicator
- diagram-dom.js (191 lines): dual renderer support (data-* + Mermaid regex)

**11-04 (Complete):** TDD tests
- viewport-transform.test.ts (118 lines): 11 tests — inverse proofs at multiple zoom levels
- dagre-layout.test.ts (164 lines): 9 tests — layout positioning, subgraphs, edge types

## Phase 12 Progress

**12-01 (Complete):** Server-side wiring
- serializeGraphModel utility in graph-serializer.ts (converts Maps→plain objects)
- graph:update WsMessage type in websocket.ts
- Server broadcasts graph:update alongside file:changed on .mmd changes
- Flags/statuses included in GET /api/graph/:file response
- 4 new integration tests, 225 total passing

**12-02 (Complete):** Auto-renderer selection + status colors
- app-init.js (351 lines): effectiveRendererType, selectRendererType, graph:update WS handler
- custom-renderer.js (142 lines): STATUS_COLORS map, applyStatusColors, lastGraphModel
- Flowcharts auto-select custom renderer (no URL param needed)
- ?renderer= override preserved for manual control

**12-03 (Complete):** Interaction module compatibility
- diagram-dom.js (213 lines): getAllNodeLabels, findEdgeElement, findMatchParent for custom SVG
- collapse-ui.js (310 lines): dual selectors .node/.smartb-node, .cluster/.smartb-subgraph
- annotations.js (491 lines): edge flags data-edge-id + L-* ID formats
- export.js (145 lines): custom SVG PNG export via direct SVG clone

## Phase 13 Progress

**13-01 (Complete):** Interaction FSM + node selection
- interaction-state.js (154 lines): 8-state FSM with transition table, SmartBInteraction API
- selection.js (300 lines): node selection (blue dashed border + corner handles), edge selection (CSS highlight), keyboard shortcuts (Delete/Escape)
- pan-zoom.js (167 lines): PAN_THRESHOLD=3px, panStarted flag, FSM state checking, FSM transitions
- live.html: 2 new script tags, app-init.js: SmartBSelection.init()
- Duration: 3 min, 225 tests pass

**13-02 (Complete):** Context menu + inline edit + integration wiring
- context-menu.js (238 lines): right-click context menu with 5 node actions, 2 edge actions
- inline-edit.js (278 lines): double-click contenteditable overlay with Enter/Escape/blur
- diagram-editor.js (485 lines): added duplicateNode(), exposed applyEdit in public API
- app-init.js (398 lines): init new modules, FSM-aware keyboard shortcuts
- collapse-ui.js (320 lines): FSM guards on click/dblclick handlers
- live.html (158 lines): 2 new script tags + help overlay rows
- Duration: 5 min, 225 tests pass

## Phase 14 Progress

**14-01 (Complete):** Command history module + popover extraction
- command-history.js (89 lines): SmartBCommandHistory with execute/undo/redo, MAX_HISTORY=100, history:changed events
- editor-popovers.js (181 lines): showAddNodePopover/showAddEdgePopover/closePopover extracted from diagram-editor.js
- diagram-editor.js refactored from 485 to 350 lines: old undoStack removed, applyEdit pushes to SmartBCommandHistory
- MmdEditor.redo exposed in public API, closeEditorPopover delegates to SmartBEditorPopovers
- Duration: 3 min, 225 tests pass

**14-02 (Complete):** Folder rename/delete operations
- POST /rmdir endpoint in routes.ts (404 lines) with resolveProjectPath security
- Folder rename/delete buttons in file-tree.js (387 lines) with confirmation dialog
- Reuses POST /move for folder rename (fs.rename works on directories natively)
- Current file path auto-updated when inside renamed/deleted folder
- Duration: 2 min, 225 tests pass

**14-03 (Complete):** Clipboard + keyboard shortcut wiring
- clipboard.js (94 lines): SmartBClipboard with copy/paste/duplicate/hasContent/clear API
- app-init.js (423 lines): Ctrl+Shift+Z/Y redo, Ctrl+C copy, Ctrl+V paste, Ctrl+D duplicate
- Contenteditable guard prevents shortcuts during inline edit
- Command history clears on file switch in file-tree.js loadFile()
- Help overlay documents Ctrl+C/V/D shortcuts
- Duration: 2 min, 225 tests pass

## Phase 15 Progress

**15-01 (Complete):** Backend infrastructure for breakpoints and ghost paths
- GhostPath interface in types.ts, BREAKPOINT_REGEX and parseBreakpoints in annotations.ts
- injectAnnotations extended with optional breakpoints parameter
- DiagramService: getBreakpoints/setBreakpoint/removeBreakpoint CRUD methods
- All write operations (set/removeFlag, set/removeStatus) now preserve all 3 annotation types
- GhostPathStore class in ghost-store.ts (in-memory per-file storage)
- 3 new WsMessage types: breakpoint:hit, breakpoint:continue, ghost:update
- 4 REST endpoints: GET/POST /api/breakpoints/:file, POST /api/breakpoints/:file/continue, GET /api/ghost-paths/:file
- buildFileTree extracted to file-tree.ts (routes.ts 471 lines)
- Duration: 4 min, 225 tests pass

**15-02 (Complete):** MCP tools for breakpoints and ghost paths
- check_breakpoints tool: returns 'pause' or 'continue' based on breakpoint state and continue signals
- record_ghost_path tool: stores ghost paths via GhostPathStore, broadcasts via WebSocket
- Both tools gracefully degrade in MCP-only mode (without --serve)
- McpToolDependencies interface, createMcpServer deferred in startMcpServer
- 13 new tests: 6 breakpoint annotation tests, 7 breakpoint/ghost store tests
- Duration: 3 min, 238 tests pass

## Session Continuity

Last session: 2026-02-16
Stopped at: Completed 15-02-PLAN.md (MCP tools for breakpoints and ghost paths)
Next action: Execute 15-03-PLAN.md (frontend UI for breakpoints and ghost paths)
