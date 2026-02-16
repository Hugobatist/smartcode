---
phase: 15-ai-breakpoints-ghost-paths
verified: 2026-02-16T01:25:00Z
status: passed
score: 6/6 must-haves verified
must_haves:
  truths:
    - "%% @breakpoint NodeId annotation marks a node as a breakpoint with visual indicator (red circle)"
    - "MCP tool check_breakpoints() returns 'pause' when AI reaches a breakpoint node"
    - "Browser shows notification bar: 'Breakpoint hit on Node X. [Continue] [Remove]'"
    - "Ghost paths (discarded reasoning branches) render as dashed edges at 30% opacity"
    - "A toggle button shows/hides ghost paths"
    - "MCP tool record_ghost_path() allows AI to log abandoned paths"
  artifacts:
    - path: "src/diagram/types.ts"
      provides: "GhostPath interface"
    - path: "src/diagram/annotations.ts"
      provides: "BREAKPOINT_REGEX, parseBreakpoints(), extended injectAnnotations()"
    - path: "src/diagram/service.ts"
      provides: "getBreakpoints, setBreakpoint, removeBreakpoint methods"
    - path: "src/server/ghost-store.ts"
      provides: "GhostPathStore class"
    - path: "src/server/websocket.ts"
      provides: "breakpoint:hit, breakpoint:continue, ghost:update WsMessage types"
    - path: "src/server/routes.ts"
      provides: "4 REST endpoints for breakpoints and ghost paths"
    - path: "src/server/server.ts"
      provides: "GhostPathStore and breakpointContinueSignals on ServerInstance"
    - path: "src/mcp/schemas.ts"
      provides: "CheckBreakpointsInput, RecordGhostPathInput Zod schemas"
    - path: "src/mcp/tools.ts"
      provides: "check_breakpoints and record_ghost_path tool registrations"
    - path: "src/mcp/server.ts"
      provides: "McpToolDependencies, createMcpServer with deps"
    - path: "static/breakpoints.js"
      provides: "SmartBBreakpoints module"
    - path: "static/breakpoints.css"
      provides: "Breakpoint indicator and notification bar styles"
    - path: "static/ghost-paths.js"
      provides: "SmartBGhostPaths module"
    - path: "static/annotations.js"
      provides: "BREAKPOINT_REGEX parsing in browser-side parseAnnotations"
    - path: "static/context-menu.js"
      provides: "Toggle Breakpoint menu item"
    - path: "static/live.html"
      provides: "Script tags, CSS link, Ghost toggle button"
    - path: "static/app-init.js"
      provides: "WS handlers, module init, B key shortcut"
    - path: "test/mcp/breakpoint-tools.test.ts"
      provides: "7 tests for breakpoint service and ghost store"
    - path: "test/diagram/annotations.test.ts"
      provides: "6 breakpoint annotation tests"
  key_links:
    - from: "src/diagram/annotations.ts"
      to: "src/diagram/service.ts"
      via: "parseBreakpoints imported and used"
    - from: "src/mcp/tools.ts"
      to: "src/diagram/service.ts"
      via: "service.getBreakpoints() in check_breakpoints handler"
    - from: "src/mcp/tools.ts"
      to: "src/server/ghost-store.ts"
      via: "ghostStore.add() in record_ghost_path handler"
    - from: "src/mcp/tools.ts"
      to: "src/server/websocket.ts"
      via: "wsManager.broadcastAll() for ghost:update and breakpoint:hit"
    - from: "static/breakpoints.js"
      to: "static/diagram-dom.js"
      via: "DiagramDOM.findNodeElement and DiagramDOM.getSVG()"
    - from: "static/app-init.js"
      to: "static/breakpoints.js"
      via: "SmartBBreakpoints.init(), showNotification, hideNotification"
    - from: "static/app-init.js"
      to: "static/ghost-paths.js"
      via: "SmartBGhostPaths.init(), updateGhostPaths"
---

# Phase 15: AI Breakpoints + Ghost Paths Verification Report

**Phase Goal:** Developers can set breakpoints on diagram nodes that pause AI execution, and discarded reasoning branches appear as ghost paths
**Verified:** 2026-02-16T01:25:00Z
**Status:** PASSED
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `%% @breakpoint NodeId` annotation marks a node as a breakpoint with visual indicator (red circle) | VERIFIED | `BREAKPOINT_REGEX` in `src/diagram/annotations.ts:8`, `parseBreakpoints()` at line 99. Browser-side `BREAKPOINT_REGEX` in `static/annotations.js:17`. Red SVG circle (`fill="#ef4444"`, `r=6`) rendered at node left edge in `static/breakpoints.js:50-56`. CSS `drop-shadow` glow in `static/breakpoints.css:7-8`. |
| 2 | MCP tool `check_breakpoints()` returns "pause" when AI reaches a breakpoint node | VERIFIED | `src/mcp/tools.ts:236-292`: `check_breakpoints` tool registered. Handler calls `service.getBreakpoints(filePath)`, checks `breakpoints.has(currentNodeId)`, returns `"pause"` text (line 275) when breakpoint exists and no continue signal. Returns `"continue"` when signal consumed or no breakpoint. Tests confirm in `test/mcp/breakpoint-tools.test.ts:38-43`. |
| 3 | Browser shows notification bar: "Breakpoint hit on Node X. [Continue] [Remove]" | VERIFIED | `static/breakpoints.js:69-103`: `showNotification(nodeId)` creates DOM elements via createElement (XSS-safe). Text "Breakpoint hit on " + nodeId with `.bp-node-name` span. Continue button (class `primary`) calls `continueBreakpoint()`. Remove button calls `removeBreakpoint()`. Bar prepended to `#preview-container`. CSS in `breakpoints.css:12-62`. WS dispatch in `static/app-init.js:389-394`. |
| 4 | Ghost paths render as dashed edges at 30% opacity | VERIFIED | `static/ghost-paths.js:62-117`: `renderGhostPaths()` creates SVG `<g class="ghost-path" opacity="0.3">` with `<path stroke-dasharray="8,4" stroke="#9ca3af" stroke-width="1.5" fill="none" marker-end="url(#arrow-normal)">`. Optional label rendered at midpoint. Inserted before first `.smartb-edge` for correct z-order. |
| 5 | A toggle button shows/hides ghost paths | VERIFIED | `static/live.html:35`: Ghost button with `onclick="SmartBGhostPaths.toggle()"` and count badge `#ghostCountBadge`. `static/ghost-paths.js:121-126`: `toggle()` flips visibility, saves to localStorage (`smartb-ghost-paths-visible`), re-renders. Active state CSS in `breakpoints.css:68-72`. Badge CSS at lines 74-94. |
| 6 | MCP tool `record_ghost_path()` allows AI to log abandoned paths | VERIFIED | `src/mcp/tools.ts:295-355`: `record_ghost_path` tool registered. Accepts `filePath, fromNodeId, toNodeId, label`. Calls `ghostStore.add()` with timestamp. Broadcasts `ghost:update` via `wsManager.broadcastAll()`. Graceful fallback for MCP-only mode (line 338-345). Tests confirm ghost store add/get/clear in `test/mcp/breakpoint-tools.test.ts:77-145`. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/diagram/types.ts` | GhostPath interface | VERIFIED | Lines 57-63: `GhostPath { fromNodeId, toNodeId, label?, timestamp }` |
| `src/diagram/annotations.ts` | parseBreakpoints, BREAKPOINT_REGEX, extended injectAnnotations | VERIFIED | 213 lines. BREAKPOINT_REGEX at line 8, parseBreakpoints at 99, injectAnnotations accepts breakpoints param at 175 |
| `src/diagram/service.ts` | getBreakpoints, setBreakpoint, removeBreakpoint | VERIFIED | 257 lines. Methods at 191, 201, 220. All write ops preserve 3 annotation types |
| `src/server/ghost-store.ts` | GhostPathStore class | VERIFIED | 31 lines. add/get/clear/clearAll methods |
| `src/server/websocket.ts` | WsMessage with breakpoint/ghost types | VERIFIED | Lines 14-17: breakpoint:hit, breakpoint:continue, ghost:update |
| `src/server/routes.ts` | 4 REST endpoints | VERIFIED | 471 lines. POST continue (350), GET breakpoints (382), POST breakpoints (401), GET ghost-paths (433) |
| `src/server/server.ts` | GhostPathStore + signals on ServerInstance | VERIFIED | ServerInstance at 155-156. createHttpServer creates both at 175-176, returns at 266 |
| `src/mcp/schemas.ts` | CheckBreakpointsInput, RecordGhostPathInput | VERIFIED | Lines 57-80: Both Zod schemas with proper field descriptions |
| `src/mcp/tools.ts` | 7 tools including check_breakpoints, record_ghost_path | VERIFIED | 356 lines. Tool 6 at 236, Tool 7 at 295. Optional deps pattern for graceful degradation |
| `src/mcp/server.ts` | McpToolDependencies, createMcpServer with deps | VERIFIED | 122 lines. Interface at 18-22, deps passed through at 38, startMcpServer extracts deps at 80-83 |
| `static/breakpoints.js` | SmartBBreakpoints module | VERIFIED | 189 lines. IIFE with init, updateBreakpoints, toggleBreakpoint, showNotification, hideNotification, continueBreakpoint, removeBreakpoint |
| `static/breakpoints.css` | Styles for indicators/notification/badge | VERIFIED | 94 lines. .breakpoint-indicator, .breakpoint-notification, .btn-breakpoint-action, .ghost-count-badge |
| `static/ghost-paths.js` | SmartBGhostPaths module | VERIFIED | 167 lines. IIFE with init, toggle, updateGhostPaths, renderGhostPaths, getCount. localStorage persistence |
| `static/annotations.js` | BREAKPOINT_REGEX + breakpoints in parseAnnotations | VERIFIED | 495 lines. BREAKPOINT_REGEX at 17, breakpoints Set in state at 23, parsing at 54-55, forwarding to SmartBBreakpoints |
| `static/context-menu.js` | Toggle Breakpoint menu item | VERIFIED | Lines 121-122: createMenuItem with SmartBBreakpoints.toggleBreakpoint call |
| `static/live.html` | Script tags, CSS link, Ghost button | VERIFIED | 173 lines. breakpoints.css at 13, Ghost button at 35, script tags at 168-169 |
| `static/app-init.js` | WS handlers, init, B shortcut, ghost fetch | VERIFIED | 457 lines. Module init at 202-203, WS handlers at 389-397, B key at 163-170, ghost fetch at 334-342 |
| `test/mcp/breakpoint-tools.test.ts` | Tests for breakpoint service + ghost store | VERIFIED | 145 lines, 7 tests all passing |
| `test/diagram/annotations.test.ts` | 6 breakpoint annotation tests | VERIFIED | 28 tests total (22 existing + 6 new breakpoint tests), all passing |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/diagram/annotations.ts` | `src/diagram/service.ts` | parseBreakpoints import | WIRED | service.ts line 6: `import { ... parseBreakpoints } from './annotations.js'`; used in 6 methods |
| `src/mcp/tools.ts` | `src/diagram/service.ts` | service.getBreakpoints() | WIRED | tools.ts line 245: `const breakpoints = await service.getBreakpoints(filePath)` |
| `src/mcp/tools.ts` | `src/server/ghost-store.ts` | ghostStore.add() | WIRED | tools.ts line 307: `ghostStore.add(filePath, { fromNodeId, toNodeId, label, timestamp })` |
| `src/mcp/tools.ts` | `src/server/websocket.ts` | wsManager.broadcastAll() | WIRED | tools.ts lines 255, 268, 316: broadcasts breakpoint:continue, breakpoint:hit, ghost:update |
| `src/server/routes.ts` | `src/server/websocket.ts` | wsManager.broadcastAll() | WIRED | routes.ts lines 368, 415: broadcasts breakpoint:continue and breakpoint:hit |
| `src/server/routes.ts` | `src/server/ghost-store.ts` | ghostStore.get() | WIRED | routes.ts line 439: `ghostStore.get(file)` in GET ghost-paths handler |
| `static/breakpoints.js` | `static/diagram-dom.js` | DiagramDOM.findNodeElement | WIRED | breakpoints.js lines 36, 45: getSVG() and findNodeElement() calls |
| `static/breakpoints.js` | `static/event-bus.js` | diagram:rendered event | WIRED | breakpoints.js line 171: `SmartBEventBus.on('diagram:rendered', applyBreakpointIndicators)` |
| `static/ghost-paths.js` | `static/diagram-dom.js` | DiagramDOM.findNodeElement | WIRED | ghost-paths.js lines 56, 63: findNodeElement() and getSVG() calls |
| `static/ghost-paths.js` | `static/event-bus.js` | diagram:rendered event | WIRED | ghost-paths.js line 151: `SmartBEventBus.on('diagram:rendered', renderGhostPaths)` |
| `static/app-init.js` | `static/breakpoints.js` | SmartBBreakpoints API calls | WIRED | app-init.js lines 202, 375, 390, 393, 167: init, updateBreakpoints, showNotification, hideNotification, toggleBreakpoint |
| `static/app-init.js` | `static/ghost-paths.js` | SmartBGhostPaths API calls | WIRED | app-init.js lines 203, 339, 396: init, updateGhostPaths |
| `static/annotations.js` | `static/breakpoints.js` | SmartBBreakpoints.updateBreakpoints | WIRED | annotations.js lines 406, 451: forwards parsed breakpoints to SmartBBreakpoints |

### Requirements Coverage

Phase 15 success criteria from ROADMAP.md:

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| 1. `%% @breakpoint NodeId` annotation with red circle indicator | SATISFIED | None |
| 2. MCP tool `check_breakpoints()` returns "pause" | SATISFIED | None |
| 3. Browser notification bar with Continue/Remove | SATISFIED | None |
| 4. Ghost paths as dashed edges at 30% opacity | SATISFIED | None |
| 5. Toggle button shows/hides ghost paths | SATISFIED | None |
| 6. MCP tool `record_ghost_path()` logs abandoned paths | SATISFIED | None |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | No anti-patterns detected |

No TODOs, FIXMEs, placeholders, empty implementations, or console.log-only handlers found in any Phase 15 files.

### Build and Test Validation

- **TypeScript typecheck:** PASSED (zero errors)
- **Test suite:** 238/238 tests pass (13 new tests added by Phase 15: 6 annotation + 7 breakpoint/ghost)
- **File size limits:** All files under 500 lines (largest: annotations.js at 495 lines)

### Human Verification Required

### 1. Breakpoint Red Circle Visual Indicator

**Test:** Open a .mmd file with `%% @breakpoint NodeId` annotation in the browser viewer. Verify a red circle appears at the left edge of the specified node.
**Expected:** Red circle with subtle red glow (drop-shadow) appears at (bbox.x - 4, bbox.y + height/2) of the node.
**Why human:** Visual positioning and appearance of SVG overlay cannot be verified programmatically.

### 2. Notification Bar Interaction

**Test:** Use the MCP check_breakpoints tool (or POST /api/breakpoints/file.mmd with action:set) to hit a breakpoint. Verify the notification bar slides down from the top of the preview container.
**Expected:** Bar reads "Breakpoint hit on [NodeId]" with green [Continue] button and [Remove Breakpoint] button. Clicking Continue sends POST to /continue and hides bar. Clicking Remove sends POST with action:remove and hides bar.
**Why human:** Requires real-time WebSocket message flow and DOM interaction testing.

### 3. Ghost Path Rendering

**Test:** Use the MCP record_ghost_path tool to create ghost paths, then toggle the Ghost button to make them visible.
**Expected:** Dashed gray lines at 30% opacity connect the from/to nodes. Labels appear at midpoints. Arrow markers are visible.
**Why human:** Visual rendering of SVG paths with opacity and dash arrays requires visual inspection.

### 4. Context Menu Toggle Breakpoint

**Test:** Right-click a node in the custom renderer and select "Toggle Breakpoint" from the context menu.
**Expected:** Red circle indicator appears on the node. Right-clicking again and selecting "Toggle Breakpoint" removes it.
**Why human:** Context menu positioning and interaction with SVG elements requires browser testing.

### 5. B Key Shortcut

**Test:** Select a node by clicking it, then press the B key.
**Expected:** Breakpoint toggles on the selected node (red circle appears/disappears).
**Why human:** Keyboard shortcut interaction with selection state requires live browser testing.

### Gaps Summary

No gaps found. All 6 success criteria are fully implemented and verified across the three-layer architecture:

1. **Backend (Plan 01):** Annotation parsing, DiagramService CRUD, GhostPathStore, REST endpoints, WebSocket types -- all substantive and wired.
2. **MCP Tools (Plan 02):** check_breakpoints and record_ghost_path registered with proper handlers, optional dependencies for graceful degradation, 13 new tests passing.
3. **Frontend (Plan 03):** SmartBBreakpoints and SmartBGhostPaths modules with full public APIs, context menu integration, B key shortcut, WebSocket handlers, ghost path fetch on file load -- all wired into app-init.js.

All 6 commits verified in git history. All files under 500-line limit. Zero anti-patterns detected. 238/238 tests pass.

---

_Verified: 2026-02-16T01:25:00Z_
_Verifier: Claude (gsd-verifier)_
