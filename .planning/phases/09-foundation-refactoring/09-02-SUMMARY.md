---
phase: 09-foundation-refactoring
plan: 02
subsystem: ui
tags: [mermaid, vanilla-js, iife, pan-zoom, svg-export, png-export, event-bus]

# Dependency graph
requires:
  - phase: 09-01
    provides: EventBus pub/sub, DiagramDOM abstraction, main.css extraction
provides:
  - renderer.js IIFE with Mermaid init, render(), error panel, status injection
  - pan-zoom.js IIFE with scroll zoom, drag pan, zoomFit/In/Out
  - export.js IIFE with SVG/PNG export using shared MERMAID_CONFIG
  - SmartBRenderer.MERMAID_CONFIG shared constant (eliminates config duplication)
  - EventBus events diagram:rendered and diagram:error
affects: [09-03, 09-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [IIFE module extraction, shared config via module API, window backward compat]

key-files:
  created:
    - static/renderer.js
    - static/pan-zoom.js
    - static/export.js
  modified:
    - static/live.html

key-decisions:
  - "isInitialRender state kept in renderer.js (render-related, not pan-zoom)"
  - "SmartBRenderer.MERMAID_CONFIG shared to eliminate triple duplication in exportPNG"
  - "window.currentFile kept in sync via explicit assignment at all mutation points"
  - "Pan/zoom state fully encapsulated in SmartBPanZoom with getPan/setPan API"

patterns-established:
  - "Shared config pattern: modules expose config objects for cross-module reuse"
  - "Window backward compat: all IIFE modules expose key functions on window for inline onclick handlers and keyboard shortcuts"

# Metrics
duration: 6min
completed: 2026-02-15
---

# Phase 9 Plan 2: Renderer, Pan/Zoom, Export Extraction Summary

**Extracted rendering pipeline, pan/zoom, and SVG/PNG export from live.html into 3 focused IIFE modules with shared MERMAID_CONFIG eliminating triple config duplication**

## Performance

- **Duration:** 6 min
- **Started:** 2026-02-15T21:10:13Z
- **Completed:** 2026-02-15T21:17:01Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Three new IIFE modules extracted from live.html (renderer.js, pan-zoom.js, export.js)
- live.html reduced from 1190 to 721 lines (469 lines removed, 39% reduction)
- Shared MERMAID_CONFIG eliminates triple duplication in exportPNG (~60 duplicated lines removed)
- EventBus integration: render emits diagram:rendered and diagram:error events
- All 131 server tests continue to pass

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract renderer.js** - `a8232dd` (feat)
2. **Task 2: Extract pan-zoom.js and export.js** - `25a1207` (feat)

## Files Created/Modified
- `static/renderer.js` (279 lines) - Mermaid init, render(), escapeHtml, injectStatusStyles, error panel with line-numbered code snippets
- `static/pan-zoom.js` (139 lines) - Zoom/pan state, wheel handler, drag handler, zoomFit, zoomIn/Out, applyTransform
- `static/export.js` (121 lines) - exportSVG, exportPNG with Canvas pipeline, download helper, uses shared MERMAID_CONFIG
- `static/live.html` (721 lines) - Removed extracted code, added script tags, updated _initHooks to delegate to SmartBPanZoom

## Decisions Made
- **isInitialRender in renderer.js:** Kept in the renderer module since it controls render behavior (auto-fit on first render vs. preserve zoom on updates). Exposed via setInitialRender/getInitialRender API for loadFile to reset it.
- **Shared MERMAID_CONFIG:** Exposed on SmartBRenderer so export.js can clone it with htmlLabels:false for PNG export. This eliminated ~60 lines of triplicated config.
- **window.currentFile sync:** Since live.html uses `var currentFile` in a script tag, every reassignment also sets `window.currentFile` so export.js (in its own IIFE scope) can read the current file path.
- **Pan state delegation:** _initHooks.getPan/setPan now delegate to SmartBPanZoom.getPan()/setPan() instead of accessing raw variables.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed drag & drop handler referencing non-existent functions**
- **Found during:** Task 2 (removing export code from live.html)
- **Issue:** Drag & drop handler referenced `knownFiles` and `renderFileList()` which don't exist (known bug #14 in STATE.md pending todos)
- **Fix:** Replaced with `refreshFileList()` which is the correct function for updating the file tree
- **Files modified:** static/live.html
- **Verification:** Code review confirmed refreshFileList is the correct function
- **Committed in:** 25a1207 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Minimal -- opportunistic fix of pre-existing bug encountered during code movement.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- live.html is at 721 lines, ready for further extraction in plans 03-04
- Remaining inline JS: file tree, editor events, sync, WebSocket handler, init block, keyboard shortcuts, collapse UI init
- All three new modules are self-contained IIFEs with clean window APIs

## Self-Check: PASSED

All files exist, all commits verified, all 131 tests pass.

---
*Phase: 09-foundation-refactoring*
*Completed: 2026-02-15*
