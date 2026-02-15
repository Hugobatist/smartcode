# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-15)

**Core value:** Developers can see what their AI is thinking and intervene surgically before it finishes

## Current Position

Phase: 09-foundation-refactoring
Plan: 01-02 complete, 03-04 pending
Status: Phase 9 in progress — renderer, pan-zoom, export extracted
Last activity: 2026-02-15 — Plan 09-02 completed (renderer.js, pan-zoom.js, export.js)

Progress: [██████████] v1.0 100% | Phase 9: [=====-----] 2/4 plans

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

**09-03 through 09-04:** Pending (file-tree, editor, app-init extraction)

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
10. `live.html` com 721 linhas (CSS + renderer/pan-zoom/export extracted, further extraction in 09-03/04)
11. Watchers de projetos adicionais nunca fechados no shutdown
12. Static file path traversal check menos rigorosa
13. Sem testes para rotas POST, WebSocketManager, FileWatcher
14. ~~Bug no drag & drop — `knownFiles` e `renderFileList` nao existem~~ — Fixed in 09-02 (replaced with refreshFileList)
15. Deps nao utilizadas: `fast-glob` e `@mermaid-js/parser`
16. Versao hardcoded em `cli.ts` e `mcp/server.ts`
17. `refreshFileList` redundante quando dados ja vem via WebSocket
18. Mistura de `var`/`let`/`const` no frontend

### Test Coverage

- 131 tests passing across 12 test files
- Key coverage: collapser (42 tests), annotations (22), service (11), server (9), parser (9)
- Gaps: no frontend tests, no WebSocket tests, no POST route tests

## Session Continuity

Last session: 2026-02-15
Stopped at: Completed 09-02-PLAN.md (renderer, pan-zoom, export extraction)
Next action: Execute 09-03-PLAN.md (file-tree, editor extraction from live.html)
