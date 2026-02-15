---
phase: 07-vscode-extension
plan: 02
subsystem: vscode-extension
tags: [vscode, webview, mermaid, rendering, flags, state-persistence, websocket]

requires:
  - phase: 07-vscode-extension
    provides: Extension scaffolding with WebviewViewProvider, WS client, esbuild dual-bundle build
  - phase: 03-websocket-real-time-sync
    provides: WebSocket server at /ws with WsMessage protocol (file:changed events)
provides:
  - Live Mermaid diagram rendering in VS Code sidebar webview via mermaid.min.js
  - Flag interaction UI with click-to-flag on SVG nodes and inline input
  - Extension host flag saving via HTTP POST to SmartB server /save endpoint
  - WebSocket message tracking with file contents cache for flag operations
  - Webview state persistence via getState/setState across hide/show cycles
  - Initial state restore when webview becomes visible (onWebviewReady callback)
affects: [07-03-PLAN]

tech-stack:
  added: ["mermaid@11 (IIFE bundle, ~2.7MB local file)"]
  patterns: ["mermaid.render() for SVG generation in webview sandbox", "Safe DOM: textContent clear + insertAdjacentHTML for sanitized SVG", "node:http for extension-to-server HTTP POST (consistent with Phase 6 pattern)", "File contents Map cache for flag append-and-save workflow"]

key-files:
  created:
    - vscode-extension/media/mermaid.min.js
    - vscode-extension/src/webview/flag-ui.ts
  modified:
    - vscode-extension/src/webview/main.ts
    - vscode-extension/src/extension.ts
    - vscode-extension/src/diagram-provider.ts
    - vscode-extension/media/webview.css
    - vscode-extension/esbuild.mjs
    - vscode-extension/tsconfig.webview.json

key-decisions:
  - "mermaid marked as external in esbuild webview config -- loaded via separate script tag to avoid CSP chunk-loading issues"
  - "node:http built-in for flag save POST -- consistent with Phase 6 CLI status pattern, avoids fetch experimental warnings"
  - "File contents tracked in Map<string, string> in extension host -- enables flag append without refetching from server"
  - "DOM.Iterable added to tsconfig.webview.json lib -- required for NodeListOf iteration in flag-ui.ts"

patterns-established:
  - "Flag save workflow: webview postMessage(addFlag) -> extension host appends annotation -> HTTP POST /save -> server normalizes on next read"
  - "Webview ready callback: onWebviewReady on DiagramViewProvider triggers initial state push from extension host cache"
  - "Mermaid render counter: incrementing ID suffix avoids mermaid.render() ID collision across re-renders"

duration: 4min
completed: 2026-02-15
---

# Phase 7 Plan 2: Webview Rendering and Flag Interaction Summary

**Live Mermaid rendering in VS Code sidebar webview with click-to-flag interaction, HTTP flag saving to SmartB server, and state persistence across panel hide/show**

## Performance

- **Duration:** 4 min
- **Started:** 2026-02-15T15:36:03Z
- **Completed:** 2026-02-15T15:40:51Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Mermaid diagrams render in the VS Code sidebar webview using locally bundled mermaid.min.js with dark theme and sandbox security
- Flag interaction: clicking a node shows an inline input, submitting saves the flag annotation to the .mmd file via HTTP POST to the SmartB server /save endpoint
- WebSocket message relay improved: extension host tracks file contents in a Map for flag append operations and initial state restore
- Webview state persistence: getState/setState preserves currentFile and lastContent across hide/show cycles, with onWebviewReady callback for server-side state push

## Task Commits

Each task was committed atomically:

1. **Task 1: Download mermaid.min.js, implement webview rendering with flag interaction and state persistence** - `cc837a1` (feat)
2. **Task 2: Extension host flag saving via HTTP and WebSocket message relay improvements** - `69aaff0` (feat)

## Files Created/Modified
- `vscode-extension/media/mermaid.min.js` - Locally bundled Mermaid IIFE library (~2.7MB) for CSP-safe webview rendering
- `vscode-extension/src/webview/main.ts` - Full webview script with mermaid.render(), message handling, and state persistence
- `vscode-extension/src/webview/flag-ui.ts` - Click-to-flag UI with inline input on SVG nodes, postMessage to extension host
- `vscode-extension/src/extension.ts` - Flag save handler (HTTP POST), file contents tracking, webview message routing
- `vscode-extension/src/diagram-provider.ts` - Added onWebviewReady callback and sendCurrentState method
- `vscode-extension/media/webview.css` - Flag input styles, node hover feedback, error message styling, SVG overflow
- `vscode-extension/esbuild.mjs` - Added mermaid as external dependency in webview config
- `vscode-extension/tsconfig.webview.json` - Added DOM.Iterable to lib array

## Decisions Made
- **mermaid.min.js as external:** The IIFE bundle is loaded via a separate `<script>` tag rather than bundled by esbuild. This avoids CSP issues with dynamic chunk loading that mermaid's ESM build requires, as documented in 07-RESEARCH.md.
- **node:http for HTTP POST:** Consistent with the Phase 6 pattern (CLI status command). Using the built-in http module avoids experimental fetch warnings and gives timeout control.
- **File contents Map in extension host:** The extension host caches file contents from WebSocket messages. When the user adds a flag, the extension appends the annotation line to the cached content and POSTs the full updated content to /save. The SmartB server normalizes the annotation block on the next read cycle.
- **DOM.Iterable in webview tsconfig:** The `for...of` loop over `NodeListOf<SVGGElement>` in flag-ui.ts requires the DOM.Iterable lib. This is separate from the base DOM lib.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added DOM.Iterable to tsconfig.webview.json lib array**
- **Found during:** Task 1 (verification step - `tsc --noEmit -p tsconfig.webview.json`)
- **Issue:** `for...of` on `NodeListOf<SVGGElement>` in flag-ui.ts requires `Symbol.iterator` which is in DOM.Iterable, not DOM
- **Fix:** Added `"DOM.Iterable"` to the `lib` array in tsconfig.webview.json
- **Files modified:** `vscode-extension/tsconfig.webview.json`
- **Verification:** `tsc --noEmit -p tsconfig.webview.json` passes
- **Committed in:** cc837a1 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed ExtensionMessage type union to avoid discriminant collision**
- **Found during:** Task 1 (verification step - `tsc --noEmit -p tsconfig.webview.json`)
- **Issue:** Intersection type `{ type: 'diagram:update' } & WsMessage` created type conflict because WsMessage also has `type` field
- **Fix:** Replaced with explicit `DiagramUpdateMessage` interface with optional WsMessage fields (file, content, files, project)
- **Files modified:** `vscode-extension/src/webview/main.ts`
- **Verification:** `tsc --noEmit -p tsconfig.webview.json` passes, switch/case correctly narrows types
- **Committed in:** cc837a1 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for TypeScript compilation. No scope creep.

## Issues Encountered
None beyond the auto-fixed deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Webview renders live Mermaid diagrams and supports flag interaction
- Extension host properly tracks and relays WebSocket messages
- Ready for plan 07-03: testing, packaging, and marketplace preparation
- The mermaid.min.js file is ~2.7MB; .vscodeignore already excludes unnecessary files for VSIX packaging

## Self-Check: PASSED

All 8 key files verified on disk. Both task commits (cc837a1, 69aaff0) verified in git log.

---
*Phase: 07-vscode-extension*
*Completed: 2026-02-15*
