# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** Developers can see what their AI is thinking and intervene surgically before it finishes
**Current focus:** Phase 4 — Interactive Browser UI

## Current Position

Phase: 4 of 8 (Interactive Browser UI)
Plan: 1 of 2 in current phase (04-01 complete)
Status: In Progress
Last activity: 2026-02-15 — Completed 04-01 (Critical Bug Fixes)

Progress: [██████░░░░] 58%

## Performance Metrics

**Velocity:**
- Total plans completed: 8
- Average duration: 3.6min
- Total execution time: 0.5 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-project-bootstrap-diagram-core | 2 | 9min | 4.5min |
| 02-http-server | 2 | 8min | 4min |
| 03-websocket-real-time-sync | 3 | 8min | 2.7min |
| 04-interactive-browser-ui | 1 | 2min | 2min |

**Recent Trend:**
- Last 5 plans: 5min, 3min, 2min, 3min, 2min
- Trend: stable/improving

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 8-phase comprehensive roadmap derived from requirement dependencies — Core+DIAG first, then HTTP, then WS, then UI+MCP in parallel, then DX+AI, then VSCode, then Scale
- [Roadmap]: Phase 5 (MCP) depends on Phase 3 (WS) not Phase 4 (UI) — MCP needs real-time broadcast but not interactive UI
- [Roadmap]: DX and AI requirements grouped together in Phase 6 — CLI polish, AI conventions, and flag-to-prompt pipeline are all post-MCP enhancements
- [01-01]: Hardcoded version string in CLI instead of importing package.json to avoid ESM import assertion complexity
- [01-01]: tsup onSuccess callback with cpSync for cross-platform static asset copy instead of shell cp command
- [01-01]: Type-only barrel export in index.ts -- runtime exports are empty, types are in dist/index.d.ts
- [01-02]: Node.js built-in fs.glob instead of fast-glob to avoid CJS-to-ESM bundling issues with tsup
- [01-02]: Regex heuristic validator instead of @mermaid-js/parser since it lacks flowchart support
- [01-02]: Annotation block format with %% --- ANNOTATIONS (auto-managed by SmartB Diagrams) --- markers
- [02-01]: Node.js built-in http.createServer with thin router instead of framework -- 8 routes do not justify Fastify overhead
- [02-01]: Route matching via RegExp array with named groups for URL parameters
- [02-01]: Two separate file roots: getStaticDir() for static assets, project dir for .mmd files
- [02-01]: Dynamic import of server module in CLI serve action for lazy loading
- [02-02]: Status classDefs appended after clean content, before render -- classDef + class directives
- [02-02]: Error panel built entirely with DOM methods (createElement + textContent) for XSS safety
- [02-02]: Extracted createHttpServer() from startServer() for integration test reuse
- [02-02]: getStaticDir() dev fallback with existsSync for dev/test compatibility
- [03-01]: ServerInstance composite return type instead of bare http.Server from createHttpServer
- [03-01]: chokidar v5 installed (ESM-only, TypeScript-native) -- compatible with project's ESM setup
- [03-01]: WsMessage discriminated union type for type-safe server-to-client messages
- [03-02]: Status dot/text driven by WebSocket onStatusChange callback, not autoSync toggle
- [03-02]: Auto-Sync toggle controls re-render only -- WS connection stays open regardless
- [03-02]: var declarations in ws-client.js for broadest browser compatibility (no build step)
- [03-03]: noServer mode with HTTP upgrade handler for multi-project URL routing
- [03-03]: Map<string, WebSocketServer> keyed by project name for namespace isolation
- [03-03]: WsMessage connected type gains project field for client namespace awareness
- [03-03]: addProject() on ServerInstance for lazy project registration with per-project FileWatcher
- [04-01]: Temporarily re-initialize mermaid with htmlLabels:false for PNG export rather than stripping foreignObject from DOM
- [04-01]: escapeHtml() on both display names and onclick path attributes with single-quote escaping for safe inline event handlers
- [04-01]: isInitialRender flag reset in loadFile() ensures file navigation always triggers zoomFit while live updates preserve position

### Pending Todos

None yet.

### Blockers/Concerns

- Research flag: Phase 5 (MCP) needs research on MCP tool/resource schema design for optimal AI agent UX
- Research flag: Phase 8 (Scalability) needs research on hierarchical diagram navigation UX patterns

## Session Continuity

Last session: 2026-02-15
Stopped at: Completed 04-01-PLAN.md (Critical Bug Fixes)
Resume file: None
