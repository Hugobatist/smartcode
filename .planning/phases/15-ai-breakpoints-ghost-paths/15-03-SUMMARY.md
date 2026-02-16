---
phase: 15-ai-breakpoints-ghost-paths
plan: 03
subsystem: ui, frontend
tags: [breakpoints, ghost-paths, svg-indicators, notification-bar, context-menu, websocket]

# Dependency graph
requires:
  - phase: 15-ai-breakpoints-ghost-paths
    plan: 01
    provides: "REST endpoints for breakpoints/ghost-paths, WebSocket message types, annotation parsing"
provides:
  - "SmartBBreakpoints module: red SVG circle indicators, notification bar, REST toggle/continue/remove"
  - "SmartBGhostPaths module: dashed translucent edge rendering, toggle with localStorage, count badge"
  - "Context menu Toggle Breakpoint action for nodes"
  - "B keyboard shortcut for toggling breakpoints on selected nodes"
  - "WebSocket handlers for breakpoint:hit, breakpoint:continue, ghost:update"
  - "Ghost path fetch on file load"
  - "Breakpoint parsing forwarded from annotations.js to breakpoints.js"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SVG overlay pattern for breakpoint indicators (red circle at node left edge)"
    - "DOM notification bar pattern (createElement, not innerHTML) for XSS-safe breakpoint:hit display"
    - "Ghost path rendering via SVG group insertion before first real edge for correct z-order"
    - "localStorage persistence for ghost path visibility toggle state"

key-files:
  created:
    - static/breakpoints.js
    - static/breakpoints.css
    - static/ghost-paths.js
  modified:
    - static/annotations.js
    - static/context-menu.js
    - static/live.html
    - static/app-init.js

key-decisions:
  - "Breakpoint indicators use SVG circle overlay (pointer-events:none) matching flag badge pattern"
  - "Ghost path visibility persisted in localStorage key 'smartb-ghost-paths-visible'"
  - "Notification bar uses DOM createElement (not innerHTML) for XSS safety"
  - "B key (no modifier) toggles breakpoint on selected node, Ctrl+B preserved for sidebar toggle"
  - "Removed unused escapeHtml function from annotations.js to stay under 500-line limit"

patterns-established:
  - "Breakpoint annotation forwarding: annotations.js parses, SmartBBreakpoints.updateBreakpoints() receives"
  - "Ghost path rendering: dashed line at 30% opacity from center to center of connected nodes"
  - "Count badge pattern (ghost-count-badge) mirroring flag-count-badge in annotations.css"

# Metrics
duration: 4min
completed: 2026-02-16
---

# Phase 15 Plan 03: Frontend UI for Breakpoints and Ghost Paths Summary

**Breakpoint red circle indicators with notification bar, ghost path dashed edges with toggle, context menu integration, and full WebSocket wiring for AI breakpoints and ghost paths**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-16T01:09:20Z
- **Completed:** 2026-02-16T01:13:44Z
- **Tasks:** 2
- **Files modified:** 7 (3 created, 4 modified)

## Accomplishments
- SmartBBreakpoints module rendering red SVG circle indicators on breakpointed nodes, with notification bar for breakpoint:hit events and REST toggle/continue/remove
- SmartBGhostPaths module rendering dashed translucent edges at 30% opacity with toggle button and localStorage persistence
- Full integration: annotations.js breakpoint parsing, context menu Toggle Breakpoint action, B keyboard shortcut, WebSocket handlers, ghost path fetch on file load
- All 238 tests pass with zero regressions, all files under 500-line limit

## Task Commits

Each task was committed atomically:

1. **Task 1: Breakpoints frontend module -- indicators, notification bar, REST integration** - `634e234` (feat)
2. **Task 2: Ghost paths rendering module and app integration wiring** - `5974394` (feat)

## Files Created/Modified
- `static/breakpoints.js` - SmartBBreakpoints IIFE: SVG red circle indicators, notification bar with Continue/Remove, REST toggle/continue/remove (189 lines)
- `static/breakpoints.css` - Styles for breakpoint indicator, notification bar, action buttons, ghost-count-badge (94 lines)
- `static/ghost-paths.js` - SmartBGhostPaths IIFE: dashed translucent edge rendering, toggle with localStorage, count badge (167 lines)
- `static/annotations.js` - Extended parseAnnotations with BREAKPOINT_REGEX, breakpoints Set in state, forwarding to SmartBBreakpoints (495 lines)
- `static/context-menu.js` - Added "Toggle Breakpoint" menu item for nodes (242 lines)
- `static/live.html` - breakpoints.css link, Ghost toggle button, script tags, help overlay rows (173 lines)
- `static/app-init.js` - Module init, WS handlers for breakpoint:hit/continue/ghost:update, B key shortcut, ghost path fetch (457 lines)

## Decisions Made
- **SVG circle indicator pattern:** Breakpoint indicators render as SVG circles at `(bbox.x - 4, bbox.y + bbox.height / 2)` with `r=6`, matching the flag badge overlay approach. Used `pointer-events: none` to avoid blocking clicks.
- **Notification bar via createElement:** Used DOM createElement (not innerHTML) for XSS safety, consistent with Phase 9+ DOM-safe pattern established in annotations.js popover.
- **B key without modifier:** The `B` key (without Ctrl/Meta) toggles breakpoint on the selected node. `Ctrl+B` was already taken by sidebar toggle, so `B` alone was the natural choice (similar to `F` for flag mode, `N` for add node, `A` for add edge).
- **Removed dead code:** Removed unused `escapeHtml` function from annotations.js (not in public API, not called anywhere) to stay under 500-line limit after adding breakpoint parsing.
- **Ghost path localStorage:** Visibility state persisted in localStorage key `smartb-ghost-paths-visible` so user preference survives page reloads.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Forward breakpoints in WS file:changed handler**
- **Found during:** Task 2 (app integration wiring)
- **Issue:** The file:changed handler in app-init.js parsed annotations but only forwarded flags and statuses to state, not breakpoints. When incoming content arrived via WebSocket with breakpoint annotations, the breakpoint UI would not update.
- **Fix:** Added `SmartBAnnotations.getState().breakpoints = incoming.breakpoints` and `SmartBBreakpoints.updateBreakpoints(incoming.breakpoints)` in the else branch of the file:changed handler.
- **Files modified:** static/app-init.js
- **Committed in:** 5974394 (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added ghost-count-badge CSS to breakpoints.css**
- **Found during:** Task 2 (live.html ghost button)
- **Issue:** The ghost toggle button uses a `.ghost-count-badge` span but no CSS existed for it. Without styles, the badge would display raw and unstyled.
- **Fix:** Added ghost-count-badge styles (mirroring flag-count-badge pattern from annotations.css) and #btnGhostPaths.active state to breakpoints.css.
- **Files modified:** static/breakpoints.css
- **Committed in:** 5974394 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 missing critical)
**Impact on plan:** Both fixes necessary for correct functionality. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 15 frontend UI complete: breakpoint indicators, notification bar, ghost paths, all integration wiring
- Plan 02 (MCP tools) is independent and can proceed in parallel
- All REST endpoints from Plan 01 are consumed by the frontend modules
- WebSocket messages (breakpoint:hit, breakpoint:continue, ghost:update) are handled in app-init.js

## Self-Check: PASSED

All 7 files verified present (3 created, 4 modified). Both commits (634e234, 5974394) confirmed in git log. All 7 artifact patterns (SmartBBreakpoints, breakpoint-notification, SmartBGhostPaths, BREAKPOINT_REGEX, Toggle Breakpoint, breakpoints.js script tag, breakpoint:hit handler) found in their respective files.

---
*Phase: 15-ai-breakpoints-ghost-paths*
*Completed: 2026-02-16*
