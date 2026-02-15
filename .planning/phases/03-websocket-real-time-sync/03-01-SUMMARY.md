---
phase: 03-websocket-real-time-sync
plan: 01
subsystem: server
tags: [websocket, ws, chokidar, file-watcher, real-time]

# Dependency graph
requires:
  - phase: 02-http-server
    provides: "createHttpServer function and HTTP integration test infrastructure"
provides:
  - "WebSocketManager class for broadcasting JSON messages to connected clients"
  - "FileWatcher class wrapping chokidar for .mmd file change detection"
  - "ServerInstance interface composing httpServer + wsManager + fileWatcher"
  - "File change events wired to WebSocket broadcast (file:changed, file:added, file:removed, tree:updated)"
affects: [03-02 client-side-websocket, 03-03 multi-project-namespacing]

# Tech tracking
tech-stack:
  added: [ws ^8.18.0, chokidar ^5.0.0, "@types/ws"]
  patterns: [ServerInstance composite return type, callback-based watcher-to-broadcast wiring]

key-files:
  created:
    - src/server/websocket.ts
    - src/watcher/file-watcher.ts
  modified:
    - src/server/server.ts
    - test/server/server.test.ts
    - package.json

key-decisions:
  - "ServerInstance composite return type instead of bare http.Server from createHttpServer"
  - "chokidar v5 installed (ESM-only, TypeScript-native) -- compatible with project's ESM setup"
  - "WsMessage discriminated union type for type-safe server-to-client messages"

patterns-established:
  - "ServerInstance: createHttpServer returns composite object with httpServer, wsManager, fileWatcher"
  - "Callback wiring: FileWatcher callbacks trigger wsManager.broadcast() with typed WsMessage"
  - "Graceful shutdown order: fileWatcher.close() -> wsManager.close() -> httpServer.close()"

# Metrics
duration: 3min
completed: 2026-02-15
---

# Phase 3 Plan 1: WebSocket + File Watcher Infrastructure Summary

**WebSocket server on /ws path with chokidar file watcher broadcasting .mmd changes to all connected clients via ServerInstance composite**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-15T12:56:07Z
- **Completed:** 2026-02-15T12:58:52Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- WebSocketManager class attaches to HTTP server on /ws path and broadcasts typed JSON messages
- FileWatcher class monitors project directory for .mmd file changes with chokidar, fires callbacks with normalized relative paths
- createHttpServer returns ServerInstance composing httpServer + wsManager + fileWatcher
- File changes trigger WebSocket broadcasts with content (file:changed) and tree updates (file:added/file:removed)
- Graceful shutdown closes watcher, WebSocket, and HTTP server in correct order
- All 61 tests pass including new WebSocket connection test

## Task Commits

Each task was committed atomically:

1. **Task 1: Install dependencies and create WebSocketManager + FileWatcher classes** - `d6324d3` (feat)
2. **Task 2: Modify createHttpServer to return ServerInstance, wire watcher to WebSocket, update tests** - `41a7f5f` (feat)

## Files Created/Modified
- `src/server/websocket.ts` - WebSocketManager class with broadcast/close methods and WsMessage type
- `src/watcher/file-watcher.ts` - FileWatcher class wrapping chokidar with .mmd filtering and path normalization
- `src/server/server.ts` - createHttpServer returns ServerInstance, startServer uses destructured instance, graceful shutdown
- `test/server/server.test.ts` - Updated to use ServerInstance, added WebSocket connection test
- `package.json` - Added ws, chokidar, @types/ws dependencies

## Decisions Made
- **ServerInstance composite return type:** Changed createHttpServer from returning bare `http.Server` to `ServerInstance` object. Internal API only, no external consumers affected.
- **chokidar v5 resolved:** npm resolved chokidar@5.0.0 (ESM-only) instead of v4. Compatible with project's ESM setup, tsc passes, all tests pass.
- **WsMessage discriminated union:** Type-safe message protocol with `satisfies` check on server sends, enabling exhaustive client-side switch.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- WebSocket server infrastructure is ready for Plan 03-02 (client-side WebSocket consumer in live.html)
- ServerInstance interface is stable for Plan 03-03 (multi-project namespacing)
- All existing HTTP tests continue to pass with the new return type

## Self-Check: PASSED

- All 5 files verified present on disk
- Both task commits (d6324d3, 41a7f5f) verified in git log

---
*Phase: 03-websocket-real-time-sync*
*Completed: 2026-02-15*
