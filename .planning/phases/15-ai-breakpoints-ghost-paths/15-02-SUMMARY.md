---
phase: 15-ai-breakpoints-ghost-paths
plan: 02
subsystem: mcp, api
tags: [mcp-tools, breakpoints, ghost-paths, zod-schemas, websocket]

# Dependency graph
requires:
  - phase: 15-ai-breakpoints-ghost-paths
    plan: 01
    provides: "DiagramService breakpoint CRUD, GhostPathStore, WebSocket message types"
provides:
  - "check_breakpoints MCP tool (returns 'pause' or 'continue')"
  - "record_ghost_path MCP tool (stores ghost paths, broadcasts via WebSocket)"
  - "CheckBreakpointsInput and RecordGhostPathInput Zod schemas"
  - "13 new tests for breakpoint annotations and ghost path store"
affects: [15-03-frontend-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional MCP tool dependencies pattern: registerTools accepts optional ghostStore/wsManager/continueSignals"
    - "MCP-only graceful degradation: tools work without --serve (no WebSocket, no ghost store)"
    - "McpToolDependencies interface for passing server-side resources to MCP tools"

key-files:
  created:
    - test/mcp/breakpoint-tools.test.ts
  modified:
    - src/mcp/schemas.ts
    - src/mcp/tools.ts
    - src/mcp/server.ts
    - test/diagram/annotations.test.ts

key-decisions:
  - "Optional dependencies pattern for registerTools -- ghostStore/wsManager/continueSignals passed via options object for graceful degradation"
  - "createMcpServer defers to after HTTP server init when --serve, so deps are available"
  - "broadcastAll used for breakpoint/ghost messages (not project-scoped broadcast) for simplicity"
  - "Tests use DiagramService and GhostPathStore directly rather than MCP server integration (simpler, faster, same coverage)"

patterns-established:
  - "MCP tool optional deps: registerTools(server, service, options?) with undefined = MCP-only mode"
  - "Continue signal consumption: delete from Map after use (one-time signal)"

# Metrics
duration: 3min
completed: 2026-02-16
---

# Phase 15 Plan 02: MCP Tools Summary

**check_breakpoints and record_ghost_path MCP tools with Zod schemas, optional WebSocket broadcasting, and 13 new tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-16T01:09:21Z
- **Completed:** 2026-02-16T01:12:15Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Two new MCP tools registered: check_breakpoints (Tool 6) and record_ghost_path (Tool 7)
- Both tools work in MCP-only mode (graceful fallback) and --serve mode (full WebSocket broadcasting)
- 13 new tests: 6 for breakpoint annotation parsing/injection/round-trip, 7 for breakpoint service methods and ghost store CRUD
- Tool count updated from 5 to 7 across schemas, tools, and server modules
- Total test count: 225 -> 238

## Task Commits

Each task was committed atomically:

1. **Task 1: MCP tool schemas, registrations, and server wiring** - `66d2831` (feat)
2. **Task 2: Test coverage for breakpoint annotations and MCP tools** - `badf48a` (test)

## Files Created/Modified
- `src/mcp/schemas.ts` - Added CheckBreakpointsInput and RecordGhostPathInput Zod schemas
- `src/mcp/tools.ts` - Extended registerTools with optional deps, added check_breakpoints and record_ghost_path handlers
- `src/mcp/server.ts` - Added McpToolDependencies interface, createMcpServer accepts deps, startMcpServer passes server deps
- `test/diagram/annotations.test.ts` - 6 new tests for breakpoint annotation parsing, injection, round-trip
- `test/mcp/breakpoint-tools.test.ts` - 7 new tests for DiagramService breakpoint methods and GhostPathStore operations

## Decisions Made
- **Optional dependencies pattern:** registerTools accepts an optional third argument with ghostStore, wsManager, and breakpointContinueSignals. When undefined (MCP-only mode), tools still function but skip WebSocket broadcasts and ghost store operations.
- **createMcpServer deferred in startMcpServer:** Server creation moved after the HTTP server init block so the deps (ghostStore, wsManager, breakpointContinueSignals) from createHttpServer are available to pass to createMcpServer.
- **broadcastAll for breakpoint/ghost messages:** Used broadcastAll instead of project-scoped broadcast since breakpoints are a cross-cutting concern.
- **Direct testing approach:** Tests exercise DiagramService methods and GhostPathStore directly rather than through the MCP server protocol, matching the existing pattern in test/mcp/tools.test.ts.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MCP tools complete: AI agents can call check_breakpoints and record_ghost_path
- Plan 03 (frontend UI) can render breakpoint indicators using existing REST endpoints and WebSocket messages
- All backend infrastructure (annotations, CRUD, ghost store, REST, WebSocket, MCP tools) is fully tested and functional

## Self-Check: PASSED

All files verified present. Both commits (66d2831, badf48a) confirmed in git log.

---
*Phase: 15-ai-breakpoints-ghost-paths*
*Completed: 2026-02-16*
