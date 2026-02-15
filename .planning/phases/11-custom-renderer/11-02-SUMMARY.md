# Plan 11-02 Summary: SVG Shape & Renderer Modules

## Status: COMPLETE

## What Was Done

### Task 1: Created `static/svg-shapes.js`
- IIFE exposing `window.SmartBSvgShapes` with a single `render(shape, w, h)` function
- All 13 Mermaid node shapes implemented as SVG element factories, each centered at origin (0,0) for dagre translate positioning
- Helper utilities: `el()` for createElementNS, `attrs()` for batch attribute setting, `polygon()` for polygon point construction
- Shape registry `SHAPE_RENDERERS` maps all 13 shape names to functions, with `rect` as fallback for unknown shapes
- Shapes are geometry-only (no fill/stroke applied) -- styling is handled by svg-renderer.js

### Task 2: Created `static/svg-renderer.js`
- IIFE exposing `window.SmartBSvgRenderer` with a single `createSVG(layout)` function
- THEME constants matching renderer.js MERMAID_CONFIG themeVariables (nodeFill, nodeStroke, edgeStroke, subgraph colors, etc.)
- `createArrowMarkers(defs)`: 3 SVG markers (arrow-normal, arrow-thick, arrow-dotted)
- `edgePointsToPath(points)`: Converts dagre edge control points to SVG path `d` attribute (M, C, L commands)
- `shortenPathToNodeBoundary(points, targetNode)`: Shape-aware endpoint clamping (circle radius, diamond inset, rectangle boundary)
- `renderNode(node)`: `<g data-node-id>` with SmartBSvgShapes shape + text, THEME styles applied. Special handling for subroutine `<g>` child elements.
- `renderEdge(edge, nodesMap)`: `<g data-edge-id>` with styled path + optional label. Supports all 5 edge types: arrow, thick, dotted, open, invisible.
- `renderSubgraph(sg)`: `<g data-subgraph-id>` with background rect + label text
- `createSVG(layout)`: Creates complete SVG element with defs, renders in correct z-order: subgraphs -> edges -> nodes

## Files Created

| File | Lines | Description |
|------|-------|-------------|
| `static/svg-shapes.js` | 218 | SVG shape factories for all 13 Mermaid node shapes |
| `static/svg-renderer.js` | 279 | Complete SVG DOM assembly from LayoutResult |

## Shape List (13 shapes)

1. `rect` -- Sharp-cornered rectangle
2. `rounded` -- Rectangle with rx=8 rounded corners
3. `stadium` -- Rectangle with fully rounded ends (rx=h/2)
4. `diamond` -- 4-point polygon (rhombus)
5. `circle` -- Circle with r=max(w,h)/2
6. `hexagon` -- 6-point polygon with h/4 indent
7. `subroutine` -- Rectangle with two inner vertical lines (double-border effect)
8. `cylinder` -- Path with elliptical top/bottom caps
9. `asymmetric` -- Flag/pennant polygon with notched right side
10. `parallelogram` -- Right-slanting polygon (skew=h*0.3)
11. `parallelogram-alt` -- Left-slanting polygon (mirror)
12. `trapezoid` -- Wider at bottom (dx=w*0.15)
13. `trapezoid-alt` -- Wider at top (inverted)

## Verification Results

- [x] `npm run build` succeeds -- both files copied to `dist/static/`
- [x] `svg-shapes.js` contains all 13 shapes (218 lines, under 350)
- [x] `svg-renderer.js` has `createSVG` and all render functions (279 lines, under 350)
- [x] Both files use `createElementNS` exclusively (never `createElement`) for SVG elements
- [x] All SVG node groups have `data-node-id` attributes
- [x] All SVG edge groups have `data-edge-id` attributes
- [x] All SVG subgraph groups have `data-subgraph-id` attributes
- [x] Theme colors match existing MERMAID_CONFIG in renderer.js
