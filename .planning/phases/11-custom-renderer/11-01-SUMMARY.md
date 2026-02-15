---
phase: 11-custom-renderer
plan: 01
status: done
completed: 2026-02-15
---

# Plan 11-01 Summary: Data & Math Foundation

## What Was Done

### Task 1: GET /api/graph/:file endpoint

Added a new REST endpoint to `src/server/routes.ts` that serves the structured GraphModel as JSON. The endpoint:

- Pattern: `GET /api/graph/:file` (regex: `/^\/api\/graph\/(?<file>.+)$/`)
- Calls `service.readGraph(file)` to parse .mmd files into a GraphModel
- Converts all Map fields (nodes, subgraphs, classDefs, nodeStyles, linkStyles, classAssignments) to plain objects using `Object.fromEntries()` for JSON serialization
- Returns 404 for ENOENT errors, 500 for other errors
- Placed before the `GET /*.mmd` catch-all route to avoid pattern conflicts

### Task 2: dagre-layout.js and viewport-transform.js

**dagre-layout.js** -- Graph layout computation module exposing `window.SmartBDagreLayout`:
- Canvas-based text measurement with lazy initialization
- `measureNodeDimensions(label, shape)` with shape-specific adjustments for circle, diamond, hexagon, and cylinder
- `computeLayout(graphModel)` creating a dagre compound graph with configurable rankdir, nodesep, ranksep
- Subgraph support via `g.setParent()` for nested subgraph hierarchies
- Workaround for dagre compound graph bug #238: redirects subgraph endpoints to their first child node
- `extractLayoutResult(g, graphModel)` returning `{ width, height, nodes[], edges[], subgraphs[] }`

**viewport-transform.js** -- Coordinate conversion class exposing `window.ViewportTransform`:
- `screenToGraph(screenX, screenY)` -- inverse transform from screen to graph space
- `graphToScreen(graphX, graphY)` -- forward transform from graph to screen space
- `zoomToFit(graphW, graphH, containerW, containerH)` -- auto-fit with 0.92 padding fraction, max zoom 2.5
- `applyToElement(el)` -- apply CSS transform to a DOM/SVG element
- `setTransform(x, y, zoom)` / `getTransform()` -- direct state access

Both files follow codebase conventions: IIFE pattern, `var` declarations, `'use strict'`, JSDoc comments.

## Files Created/Modified

| File | Action | Lines |
|------|--------|-------|
| `src/server/routes.ts` | Modified (added route) | 389 |
| `static/dagre-layout.js` | Created | 283 |
| `static/viewport-transform.js` | Created | 107 |

## Verification Results

- `npm run typecheck`: Pass (zero errors)
- `npm test`: All 201 tests pass (zero regressions)
- `npm run build`: Success (static files copied to dist/static/)
- dagre-layout.js: 283 lines (under 300 limit)
- viewport-transform.js: 107 lines (under 150 limit)
- routes.ts: 389 lines (under 500 limit)
