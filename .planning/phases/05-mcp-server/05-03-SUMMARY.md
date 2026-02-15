---
phase: 05-mcp-server
plan: 03
subsystem: mcp
tags: [mcp, stdio, http, websocket, shared-process, graceful-shutdown]

# Dependency graph
requires:
  - phase: 05-mcp-server
    plan: 02
    provides: "MCP tools and resources fully registered on server"
  - phase: 03-websocket-real-time-sync
    provides: "WebSocket broadcast and FileWatcher infrastructure"
  - phase: 02-http-server
    provides: "createHttpServer() and HTTP server infrastructure"
provides:
  - "McpServerOptions interface with dir/serve/port"
  - "--serve mode sharing DiagramService between MCP stdio and HTTP+WS servers"
  - "Graceful shutdown on stdin end, SIGINT, SIGTERM"
  - "createHttpServer() accepts optional existingService for shared-process mode"
  - "CLI mcp command with --serve and --port options"
affects: [06-cli-dx]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Shared DiagramService between MCP and HTTP via optional parameter injection", "Ordered shutdown: fileWatcher.close -> wsManager.close -> httpServer.close"]

key-files:
  created: []
  modified:
    - src/mcp/server.ts
    - src/cli.ts
    - src/server/server.ts

key-decisions:
  - "Optional existingService parameter on createHttpServer() for backward-compatible dependency injection"
  - "Dynamic imports of createHttpServer and detect-port in --serve path for lazy loading"
  - "Port 0 support for ephemeral port in testing scenarios"

patterns-established:
  - "Shared service injection: higher-level process creates service, passes to lower-level servers"
  - "Graceful shutdown: listen for stdin end + SIGINT/SIGTERM, close resources in reverse-creation order"

# Metrics
duration: 2min
completed: 2026-02-15
---

# Phase 5 Plan 3: Shared Process and Graceful Shutdown Summary

**--serve mode sharing DiagramService between MCP stdio and HTTP+WS servers in one process, with graceful shutdown on stdin end and signals**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-15T14:23:06Z
- **Completed:** 2026-02-15T14:24:52Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added McpServerOptions interface with dir, serve, and port options to startMcpServer()
- In --serve mode, a single DiagramService instance is shared between MCP and HTTP+WS servers so MCP tool calls that write .mmd files trigger immediate WebSocket broadcasts to connected browsers
- Implemented graceful shutdown handling stdin end (parent disconnect), SIGINT, and SIGTERM with ordered cleanup: fileWatcher -> wsManager -> httpServer
- Extended createHttpServer() to accept optional existing DiagramService -- backward-compatible 1-line change
- Added --serve and --port CLI options to smartb mcp command

## Task Commits

Each task was committed atomically:

1. **Task 1: Add --serve mode for shared MCP+HTTP process with graceful shutdown** - `8fc47c7` (feat)
2. **Task 2: End-to-end build verification and stdout audit** - No commit (verification-only task, no code changes needed)

## Files Created/Modified
- `src/mcp/server.ts` - McpServerOptions interface, --serve mode with shared DiagramService, graceful shutdown
- `src/cli.ts` - Added --serve and --port options to mcp command
- `src/server/server.ts` - createHttpServer() accepts optional existingService parameter

## Decisions Made
- Used optional parameter injection (existingService?) on createHttpServer() rather than a factory/builder pattern -- minimal change, fully backward-compatible with all existing callers
- Dynamic imports of createHttpServer and detect-port only in the --serve code path to avoid loading HTTP server code when running stdio-only
- Ordered shutdown mirrors the existing startServer() pattern: fileWatcher.close() -> wsManager.close() -> httpServer.close()

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 5 (MCP Server) is complete -- all 3 plans delivered
- MCP server supports two modes: stdio-only (lightweight for AI tools) and --serve (with browser UI)
- Full feedback loop verified: MCP tool -> DiagramService -> file write -> FileWatcher -> WebSocket -> browser
- Ready for Phase 6 (CLI/DX) to build on the complete MCP + HTTP + WS foundation

## Self-Check: PASSED

All 3 modified files verified present. Task commit (8fc47c7) verified in git log.

---
*Phase: 05-mcp-server*
*Completed: 2026-02-15*
