# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** Developers can see what their AI is thinking and intervene surgically before it finishes

## Current Position

Phase: 10-graph-model-parser
Plan: 02 of 03 complete
Status: Plan 10-02 complete — parseMermaidToGraph parser implemented with 30 tests
Last activity: 2026-02-15 — Plan 10-02 completed (multi-pass parser + TDD)

Progress: [██████████] v1.0 100% | Phase 10: [======----] 2/3 plans complete

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

- 161 tests passing across 13 test files
- Key coverage: collapser (42 tests), graph-parser (30), annotations (22), service (11), server (9), parser (9)
- Gaps: no frontend tests, no WebSocket tests, no POST route tests

## Session Continuity

Last session: 2026-02-15
Stopped at: Completed 10-02-PLAN.md (parseMermaidToGraph multi-pass parser)
Next action: Execute 10-03-PLAN.md (GraphModel serializer for round-trip support)
