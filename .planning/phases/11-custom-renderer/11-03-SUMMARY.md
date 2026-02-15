# Plan 11-03 Summary: Custom Renderer Orchestrator & Toggle

## Status: Tasks 1-2 Complete, Task 3 Pending

## Task 1: Create custom-renderer.js & Update live.html

### custom-renderer.js (92 lines)
- Created `static/custom-renderer.js` as IIFE exposing `window.SmartBCustomRenderer`
- `render(graphModel)` -- async entry point:
  - Guard check for graphModel and nodes
  - Waits for `document.fonts.ready` before layout
  - Runs `SmartBDagreLayout.computeLayout()` for dagre layout
  - Builds SVG via `SmartBSvgRenderer.createSVG()`
  - Inserts into preview div, clears previous content
  - Applies pan-zoom transform
  - Auto-fits on initial render via `SmartBRenderer.getInitialRender()`
  - Applies flags and collapse overlays if modules present
  - Emits `diagram:rendered` event with renderer: 'custom'
- `fetchAndRender(filePath)` -- fetches from `/api/graph/` endpoint

### live.html modifications
- Added dagre CDN script (`@dagrejs/dagre@2.0.4`) BEFORE mermaid CDN
- Added 5 new module scripts after search.js, before app-init.js:
  - viewport-transform.js, dagre-layout.js, svg-shapes.js, svg-renderer.js, custom-renderer.js
- app-init.js remains the last script loaded

## Task 2: Renderer Toggle in app-init.js & DiagramDOM Extensions

### app-init.js modifications (304 lines)
- Added `rendererType` from `?renderer=` query param (defaults to 'mermaid')
- Added `renderWithType(text)` wrapper function:
  - Custom mode: calls `SmartBCustomRenderer.fetchAndRender(currentFile)`
  - Mermaid mode: calls `SmartBRenderer.render(text)`
  - Custom mode has fallback to Mermaid on error
- Replaced ALL 9 `render(...)` calls with `renderWithType(...)`:
  - Initial file load (2 calls)
  - Collapse onToggle callback
  - Focus mode: focus, navigate, exit actions (3 calls)
  - Auto-collapse initial render
  - WebSocket file:changed handler
  - Drag & drop handler
- `_initHooks.renderDiagram` points to `renderWithType`
- Added CUSTOM indicator badge in topbar status when `renderer=custom`
- Exposed `rendererType` on `window.SmartBApp`

### diagram-dom.js modifications (191 lines)
- Added `getRendererType()` -- detects `.smartb-diagram` class for custom SVG
- Updated `findNodeElement()` -- tries `[data-node-id]` first, then Mermaid regex
- Updated `findSubgraphElement()` -- tries `[data-subgraph-id]` first, then Mermaid regex
- Updated `extractNodeId()` -- checks `data-node-id`, `data-edge-id`, `data-subgraph-id` attributes before regex patterns
- Updated `getNodeLabel()` -- for custom SVG, gets text from direct child `<text>` element
- Updated `findMatchParent()` -- added `.smartb-node` and `.smartb-subgraph` to classList check
- All changes are additive -- existing Mermaid behavior fully preserved

## Verification Results
- `npm run build` -- SUCCESS
- `npm test` -- ALL 221 tests pass
- custom-renderer.js: 92 lines (under 150 limit)
- live.html: has dagre CDN and all 5 new script tags
- app-init.js: has rendererType and renderWithType (304 lines)
- diagram-dom.js: has getRendererType method (191 lines)
- All files under 500 lines

## Task 3: Human Visual Verification -- PENDING
Requires manual browser testing with `?renderer=custom` query parameter.
The orchestrator will handle this verification checkpoint.
