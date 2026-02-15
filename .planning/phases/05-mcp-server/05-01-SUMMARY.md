---
phase: 05-mcp-server
plan: 01
subsystem: mcp
tags: [mcp, zod, stdio, annotations, status]

# Dependency graph
requires:
  - phase: 01-project-bootstrap-diagram-core
    provides: "DiagramService, annotation system (@flag parsing/injection), types"
  - phase: 03-websocket-real-time-sync
    provides: "WebSocket broadcast infrastructure for MCP-triggered file changes"
provides:
  - "MCP SDK (@modelcontextprotocol/sdk v1.26.0) and Zod (v4.3.6) dependencies"
  - "Zod schemas for all 4 MCP tool inputs (UpdateDiagram, ReadFlags, GetDiagramContext, UpdateNodeStatus)"
  - "@status annotation parsing and injection alongside @flag annotations"
  - "DiagramService status methods (getStatuses, setStatus, removeStatus)"
  - "MCP server skeleton with createMcpServer() and startMcpServer()"
  - "smartb mcp CLI command with --dir option"
affects: [05-02, 05-03, 06-cli-dx]

# Tech tracking
tech-stack:
  added: ["@modelcontextprotocol/sdk ^1.26.0", "zod ^4.3.6"]
  patterns: ["Raw Zod shapes for MCP inputSchema (not wrapped in z.object)", "StdioServerTransport for MCP communication", "@status annotation format: %% @status nodeId statusValue"]

key-files:
  created:
    - src/mcp/schemas.ts
    - src/mcp/server.ts
  modified:
    - package.json
    - src/diagram/annotations.ts
    - src/diagram/types.ts
    - src/diagram/service.ts
    - src/cli.ts
    - test/diagram/annotations.test.ts

key-decisions:
  - "Raw Zod shapes (not z.object wrapped) for MCP SDK registerTool inputSchema compatibility"
  - "@status annotation format without quotes: %% @status nodeId statusValue (simpler than flag format since status is an enum)"
  - "parseFlags skips @status lines silently (no spurious warnings for valid annotations)"
  - "Dynamic import of DiagramService in startMcpServer for lazy loading consistency with serve command"

patterns-established:
  - "MCP code zero-stdout: all logging via console.error through existing logger"
  - "Annotation type extensibility: new annotation types follow same block-parsing pattern as flags"
  - "Status methods mirror flag methods pattern: get/set/remove with file read-modify-write"

# Metrics
duration: 4min
completed: 2026-02-15
---

# Phase 5 Plan 1: MCP Server Foundation Summary

**MCP SDK + Zod installed, @status annotation system with DiagramService methods, Zod schemas for 4 tools, and stdio MCP server skeleton with `smartb mcp` CLI command**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-15T14:12:00Z
- **Completed:** 2026-02-15T14:16:33Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Installed @modelcontextprotocol/sdk v1.26.0 and Zod v4.3.6 as production dependencies
- Extended annotation system to support @status annotations alongside existing @flag annotations
- Added getStatuses/setStatus/removeStatus methods to DiagramService with full read-modify-write cycle
- Created MCP server skeleton that starts on stdio transport and responds to protocol init
- Added `smartb mcp` CLI command with --dir option following existing serve command pattern
- Created Zod schemas for all 4 MCP tool inputs (UpdateDiagram, ReadFlags, GetDiagramContext, UpdateNodeStatus)
- Added 13 new tests for status annotation parsing, injection, and round-trip

## Task Commits

Each task was committed atomically:

1. **Task 1: Install MCP SDK + Zod, create schemas, extend annotations for @status** - `bf7db56` (feat)
2. **Task 2: Create MCP server skeleton and smartb mcp CLI command** - `cd9775b` (feat)

## Files Created/Modified
- `src/mcp/schemas.ts` - Zod schemas for all 4 MCP tool inputs (raw shapes, not z.object wrapped)
- `src/mcp/server.ts` - MCP server factory (createMcpServer) and stdio launcher (startMcpServer)
- `src/diagram/annotations.ts` - Added parseStatuses(), extended injectAnnotations() with optional statuses param
- `src/diagram/types.ts` - Added statuses field to DiagramContent interface
- `src/diagram/service.ts` - Added getStatuses/setStatus/removeStatus methods, statuses in readDiagram
- `src/cli.ts` - Added smartb mcp command with --dir option
- `package.json` - Added @modelcontextprotocol/sdk and zod dependencies
- `test/diagram/annotations.test.ts` - 13 new tests for status annotation parsing/injection/round-trip

## Decisions Made
- Used raw Zod shapes (not z.object wrapped) for MCP SDK registerTool inputSchema -- the SDK wraps them internally
- @status annotation format uses bare values without quotes (`%% @status nodeId ok`) since status is a constrained enum, unlike flag messages which need quoted strings
- Updated parseFlags to silently skip @status lines instead of logging debug warnings for unrecognized annotations
- Used dynamic import of DiagramService in startMcpServer for consistency with existing lazy-loading pattern in CLI serve command

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed parseFlags warning on valid @status lines**
- **Found during:** Task 1 (extending annotations)
- **Issue:** parseFlags logged debug warnings for any non-flag line in the annotation block, which would produce noise for valid @status lines
- **Fix:** Added STATUS_REGEX check before logging the warning -- @status lines are now silently skipped by parseFlags
- **Files modified:** src/diagram/annotations.ts
- **Verification:** Existing tests pass, no spurious warnings
- **Committed in:** bf7db56 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Minor correctness fix to prevent log noise. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MCP server skeleton is ready for tool registration (plan 05-02) and resource registration (plan 05-03)
- All 4 Zod schemas are defined and importable for use in registerTool() calls
- DiagramService has full status CRUD support, enabling the update_node_status tool
- `smartb mcp` CLI command starts the server, ready for AI tool configuration

## Self-Check: PASSED

All 7 created/modified files verified present. Both task commits (bf7db56, cd9775b) verified in git log.

---
*Phase: 05-mcp-server*
*Completed: 2026-02-15*
