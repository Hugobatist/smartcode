---
phase: 15-ai-breakpoints-ghost-paths
plan: 01
subsystem: api, diagram
tags: [breakpoints, ghost-paths, annotations, websocket, rest-api]

# Dependency graph
requires:
  - phase: 14-undo-redo-edit-actions
    provides: "DiagramService CRUD pattern, annotation system"
provides:
  - "Breakpoint annotation parsing (parseBreakpoints) and injection"
  - "GhostPath type and in-memory GhostPathStore"
  - "REST endpoints for breakpoints and ghost paths"
  - "WebSocket message types: breakpoint:hit, breakpoint:continue, ghost:update"
  - "DiagramService getBreakpoints/setBreakpoint/removeBreakpoint methods"
affects: [15-02-mcp-tools, 15-03-frontend-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-annotation preservation: all write operations now persist flags+statuses+breakpoints"
    - "GhostPathStore in-memory Map pattern for session-scoped data"
    - "breakpointContinueSignals Map for cross-endpoint communication"

key-files:
  created:
    - src/server/ghost-store.ts
    - src/server/file-tree.ts
  modified:
    - src/diagram/types.ts
    - src/diagram/annotations.ts
    - src/diagram/service.ts
    - src/server/websocket.ts
    - src/server/routes.ts
    - src/server/server.ts

key-decisions:
  - "Three-annotation preservation pattern: every write operation reads and re-injects all three annotation types"
  - "GhostPathStore and breakpointContinueSignals created in createHttpServer and exposed on ServerInstance"
  - "buildFileTree extracted to file-tree.ts to keep routes.ts under 500 lines"
  - "POST /api/breakpoints/:file/continue route registered BEFORE general breakpoints route for pattern specificity"

patterns-established:
  - "Breakpoint annotation format: %% @breakpoint NodeId"
  - "Ghost paths stored in-memory per file (no disk persistence)"
  - "Continue signals via Map<string, boolean> keyed by file:nodeId"

# Metrics
duration: 4min
completed: 2026-02-16
---

# Phase 15 Plan 01: Backend Infrastructure Summary

**Breakpoint annotation parsing, GhostPath type, in-memory ghost store, 4 REST endpoints, and 3 WebSocket message types for AI breakpoints and ghost paths**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-16T01:02:11Z
- **Completed:** 2026-02-16T01:06:33Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Extended annotation system with breakpoint parsing/injection alongside existing flags and statuses
- All write operations (setFlag/removeFlag/setStatus/removeStatus) now preserve all three annotation types
- GhostPathStore class for in-memory per-file ghost path storage
- 4 REST endpoints: GET/POST breakpoints, POST continue, GET ghost-paths
- 3 new WebSocket message types for real-time breakpoint/ghost communication
- All 225 existing tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend annotation system with breakpoint parsing and injection** - `dd52ea8` (feat)
2. **Task 2: Ghost path store, WebSocket types, and REST endpoints** - `02749ef` (feat)

## Files Created/Modified
- `src/diagram/types.ts` - Added GhostPath interface
- `src/diagram/annotations.ts` - Added BREAKPOINT_REGEX, parseBreakpoints(), extended injectAnnotations() with breakpoints param
- `src/diagram/service.ts` - Added getBreakpoints/setBreakpoint/removeBreakpoint, updated all write ops to preserve three annotation types
- `src/server/ghost-store.ts` - New GhostPathStore class with add/get/clear/clearAll
- `src/server/file-tree.ts` - Extracted buildFileTree utility from routes.ts
- `src/server/websocket.ts` - Added breakpoint:hit, breakpoint:continue, ghost:update to WsMessage union
- `src/server/routes.ts` - 4 new route handlers for breakpoints and ghost paths
- `src/server/server.ts` - GhostPathStore and breakpointContinueSignals on ServerInstance

## Decisions Made
- **Three-annotation preservation:** Every write operation now reads and re-injects flags, statuses, AND breakpoints. Previously setFlag/removeFlag only preserved flags, losing statuses (a latent bug). This change makes all annotation operations safe.
- **GhostPathStore in createHttpServer:** Store and continue signals created at server level and passed to registerRoutes as parameters, then exposed on ServerInstance for MCP tool access.
- **buildFileTree extraction:** Extracted TreeNode interface and buildFileTree function to `src/server/file-tree.ts` to keep routes.ts under 500 lines after adding 4 new routes.
- **Route ordering:** POST /api/breakpoints/:file/continue registered BEFORE GET/POST /api/breakpoints/:file so the more specific `/continue` suffix matches first.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed setFlag/removeFlag not preserving statuses**
- **Found during:** Task 1 (extending annotation system)
- **Issue:** The existing setFlag() and removeFlag() methods only read/wrote flags, silently dropping any existing statuses on the file. The plan noted this as "CRITICAL" -- these methods needed to also read and pass statuses.
- **Fix:** Updated setFlag and removeFlag to also call parseStatuses(raw) and parseBreakpoints(raw), passing all three to writeDiagram.
- **Files modified:** src/diagram/service.ts
- **Verification:** npm test -- all 225 tests pass
- **Committed in:** dd52ea8 (Task 1 commit)

**2. [Rule 3 - Blocking] Extracted buildFileTree to keep routes.ts under 500 lines**
- **Found during:** Task 2 (adding REST endpoints)
- **Issue:** routes.ts was at 513 lines after adding 4 new routes, exceeding the project's 500-line limit
- **Fix:** Extracted TreeNode interface and buildFileTree function to new `src/server/file-tree.ts` (42 lines)
- **Files modified:** src/server/routes.ts, src/server/file-tree.ts (new)
- **Verification:** routes.ts now 471 lines, typecheck passes
- **Committed in:** 02749ef (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for correctness and architectural compliance. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend infrastructure complete: annotation parsing, CRUD, ghost store, WS types, REST endpoints
- Plan 02 (MCP tools) can import DiagramService breakpoint methods and GhostPathStore from ServerInstance
- Plan 03 (frontend UI) can use REST endpoints and WebSocket messages to render breakpoint indicators and ghost paths

## Self-Check: PASSED

All 8 files verified present. Both commits (dd52ea8, 02749ef) confirmed in git log. All 6 artifact patterns (GhostPath, parseBreakpoints, getBreakpoints, GhostPathStore, breakpoint:hit, breakpoints routes) found in their respective files.

---
*Phase: 15-ai-breakpoints-ghost-paths*
*Completed: 2026-02-16*
