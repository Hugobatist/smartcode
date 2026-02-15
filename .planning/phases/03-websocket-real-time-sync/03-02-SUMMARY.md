---
phase: 03-websocket-real-time-sync
plan: 02
subsystem: client
tags: [websocket, reconnect, exponential-backoff, real-time, live-reload]

# Dependency graph
requires:
  - phase: 03-websocket-real-time-sync
    plan: 01
    provides: "WebSocketManager broadcasting file changes on /ws path, ServerInstance composite"
provides:
  - "ws-client.js: reconnecting WebSocket client with exponential backoff (500ms-16s) + jitter"
  - "live.html WebSocket integration replacing all polling with push-based updates"
  - "Connection status indicator driven by WebSocket state (connected/disconnected/reconnecting)"
affects: [03-03 multi-project-namespacing]

# Tech tracking
tech-stack:
  added: []
  patterns: [browser-native WebSocket with reconnect wrapper, push-based live reload]

key-files:
  created:
    - static/ws-client.js
  modified:
    - static/live.html

key-decisions:
  - "Status dot/text now driven by WebSocket onStatusChange callback, not autoSync toggle"
  - "Auto-Sync toggle controls re-render behavior only -- WS connection stays open regardless"
  - "var declarations in ws-client.js for broadest browser compatibility (no build step)"

patterns-established:
  - "createReconnectingWebSocket(url, onMessage, onStatusChange) API for browser WS connections"
  - "WebSocket message dispatch via switch(msg.type) in onMessage callback"
  - "Connection status: 'connected' | 'disconnected' | 'reconnecting' tri-state"

# Metrics
duration: 2min
completed: 2026-02-15
---

# Phase 3 Plan 2: Client-Side WebSocket with Reconnect Summary

**Reconnecting WebSocket client replacing 2s/5s polling with push-based diagram updates and tri-state connection indicator**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-15T13:01:41Z
- **Completed:** 2026-02-15T13:03:18Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- ws-client.js provides reconnecting WebSocket with exponential backoff (500ms base, 16s cap) and jitter to prevent thundering herd
- live.html fully migrated from polling (setInterval syncFile 2s + refreshFileList 5s) to WebSocket push events
- Connection status indicator shows connected/disconnected/reconnecting driven by WebSocket state
- Auto-Sync toggle controls whether incoming file:changed events trigger re-render (WS stays connected)
- file:changed, file:added, file:removed, tree:updated message types all handled in client
- All 61 existing tests continue to pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Create ws-client.js with reconnecting WebSocket** - `79e9e06` (feat)
2. **Task 2: Replace polling with WebSocket in live.html** - `e9525fa` (feat)

## Files Created/Modified
- `static/ws-client.js` - Reconnecting WebSocket client with exponential backoff + jitter, exposes createReconnectingWebSocket()
- `static/live.html` - WebSocket integration replacing polling, connection status display, ws-client.js script tag

## Decisions Made
- **Status indicator decoupled from autoSync:** The status dot and text are now driven entirely by the WebSocket onStatusChange callback. The autoSync toggle only controls whether incoming updates trigger re-render -- the connection remains open regardless. This gives users accurate connection state feedback even when auto-sync is paused.
- **var declarations in ws-client.js:** Used `var` instead of `let`/`const` for broadest browser compatibility, consistent with the fact that this is a plain JS file with no build step.
- **Init IIFE restructured:** Removed the early `return` after initial file load to allow WebSocket initialization to run in all cases.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Client-side WebSocket consumer is complete, ready for Plan 03-03 (multi-project namespacing)
- The createReconnectingWebSocket API is generic and can be reused if WS URL changes per project
- End-to-end real-time flow is complete: chokidar -> FileWatcher -> WebSocketManager -> ws-client.js -> render()

## Self-Check: PASSED

- All 2 files verified present on disk
- Both task commits (79e9e06, e9525fa) verified in git log

---
*Phase: 03-websocket-real-time-sync*
*Completed: 2026-02-15*
