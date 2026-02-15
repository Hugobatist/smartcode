# Phase 11: Custom Renderer - Research

**Researched:** 2026-02-15
**Domain:** dagre graph layout, SVG rendering, viewport transforms, browser-side rendering pipeline
**Confidence:** HIGH

## Summary

Phase 11 replaces Mermaid.js as the sole renderer with a custom SVG pipeline that: (1) takes a GraphModel from Phase 10, (2) uses dagre to compute node positions and edge routing, (3) renders the result as native SVG DOM elements with `data-node-id` attributes for direct manipulation. This is the critical enabling phase for all subsequent v2.0 features -- canvas interactions (Phase 13), ghost paths (Phase 15), and heatmaps (Phase 16) all require direct SVG control that Mermaid's opaque `render()` cannot provide.

The architecture follows the strangler fig pattern: the custom renderer lives alongside Mermaid and is toggled via `?renderer=custom`. The existing `SmartBRenderer.render(code)` pipeline remains untouched. A new `SmartBCustomRenderer.render(graphModel)` pipeline is added in parallel. The `DiagramDOM` abstraction layer (Phase 9) is extended with a `getRendererType()` method so downstream modules (annotations, search, collapse) can eventually work with both renderers.

The core technical challenge is three-fold: (a) computing node dimensions before layout (dagre requires width/height inputs), (b) mapping 13 Mermaid node shapes to SVG primitives, and (c) building a ViewportTransform class that handles screen-to-graph coordinate conversion at all zoom levels. Dagre is the correct layout engine choice -- it is the same engine Mermaid uses internally, is 30KB gzipped, synchronous, and handles compound graphs (subgraphs) natively via `setParent()`.

**Primary recommendation:** Build the renderer as three distinct browser-side modules: `dagre-layout.js` (graph model to positioned layout), `svg-renderer.js` (positioned layout to SVG DOM), and `viewport-transform.js` (coordinate math). Load dagre via CDN (`@dagrejs/dagre@2.0.4` from jsDelivr). Measure node text dimensions using a hidden Canvas 2D context before passing width/height to dagre. Generate SVG using native `document.createElementNS()` -- no D3, no libraries.

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @dagrejs/dagre | 2.0.4 | Graph layout engine (node positioning, edge routing) | Same engine Mermaid uses; ~30KB gzipped; synchronous; supports compound graphs (subgraphs); MIT license; 426K weekly downloads |
| Native SVG DOM API | (browser built-in) | SVG element creation and manipulation | Zero dependencies; `createElementNS()` is the standard for programmatic SVG; no library overhead for the 5-6 SVG primitives needed (rect, circle, polygon, path, text, g) |
| Canvas 2D measureText | (browser built-in) | Pre-layout text measurement for node dimensions | Only reliable way to measure text width before rendering; creates a hidden canvas, sets font, calls `measureText()` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none) | - | - | Zero new npm dependencies -- dagre loaded via CDN in browser, all rendering uses native APIs |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| dagre (for layout) | ELK.js | ELK is more powerful (better subgraph layout, orthogonal routing) but 1.3MB vs 30KB, asynchronous API (requires Web Worker or async), and would introduce complexity. Dagre matches Mermaid's output closely since Mermaid uses dagre internally. |
| dagre (for layout) | d3-hierarchy | Only handles tree layouts, not general directed graphs with cross-edges. |
| Native SVG DOM | D3.js | D3 adds ~70KB for selection/manipulation that native APIs handle in ~20 lines. The project explicitly avoids heavy dependencies. |
| Native SVG DOM | Cytoscape.js | Full graph visualization library (300KB+). Overkill -- we only need layout (dagre does this) and rendering (native SVG does this). |
| Canvas measureText | Hidden SVG getBBox | getBBox requires the element to be in the DOM, is slower, and has inconsistent results across browsers. Canvas measureText is faster and more predictable. |

**Browser-side loading:**
```html
<!-- In live.html, before custom renderer scripts -->
<script src="https://cdn.jsdelivr.net/npm/@dagrejs/dagre@2.0.4/dist/dagre.min.js"></script>
```

## Architecture Patterns

### Recommended Project Structure

```
static/
  dagre-layout.js      # NEW -- GraphModel -> dagre -> positioned LayoutResult
  svg-renderer.js      # NEW -- LayoutResult -> SVG DOM elements
  svg-shapes.js        # NEW -- Shape drawing functions (13 shapes)
  viewport-transform.js # NEW -- ViewportTransform class (screen <-> graph)
  custom-renderer.js   # NEW -- Orchestrator: SmartBCustomRenderer.render(graphModel)
  renderer.js          # EXISTING -- Mermaid pipeline (unchanged)
  diagram-dom.js       # MODIFIED -- add getRendererType(), extend for custom SVG queries
  event-bus.js         # EXISTING (unchanged)
  pan-zoom.js          # EXISTING (unchanged, ViewportTransform is separate)
  app-init.js          # MODIFIED -- wire ?renderer=custom toggle
  live.html            # MODIFIED -- add dagre CDN script, add custom renderer scripts
```

### Pattern 1: Dagre Layout Pipeline

**What:** Convert a GraphModel (from Phase 10, received as JSON) into a dagre graph, run layout, extract positions.
**When to use:** Every time the custom renderer needs to render a diagram.

```javascript
// static/dagre-layout.js

/**
 * Convert a GraphModel JSON object to a dagre graph, compute layout,
 * and return a LayoutResult with positioned nodes, edges, and subgraphs.
 */
function computeLayout(graphModel) {
    var g = new dagre.graphlib.Graph({ compound: true });

    g.setGraph({
        rankdir: graphModel.direction,   // 'TB', 'LR', 'BT', 'RL'
        nodesep: 60,                     // horizontal spacing (matches Mermaid)
        ranksep: 80,                     // vertical spacing (matches Mermaid)
        edgesep: 10,
        marginx: 20,
        marginy: 20,
    });

    g.setDefaultEdgeLabel(function() { return {}; });

    // Add nodes with measured dimensions
    var entries = Object.entries(graphModel.nodes);
    for (var i = 0; i < entries.length; i++) {
        var nodeId = entries[i][0];
        var node = entries[i][1];
        var dims = measureNodeDimensions(node.label, node.shape);
        g.setNode(nodeId, {
            label: node.label,
            width: dims.width,
            height: dims.height,
            shape: node.shape,
        });
    }

    // Set subgraph parents (compound graph)
    var sgEntries = Object.entries(graphModel.subgraphs);
    for (var j = 0; j < sgEntries.length; j++) {
        var sgId = sgEntries[j][0];
        var sg = sgEntries[j][1];
        g.setNode(sgId, { label: sg.label });
        for (var k = 0; k < sg.nodeIds.length; k++) {
            g.setParent(sg.nodeIds[k], sgId);
        }
        if (sg.parentId) {
            g.setParent(sgId, sg.parentId);
        }
    }

    // Add edges
    for (var e = 0; e < graphModel.edges.length; e++) {
        var edge = graphModel.edges[e];
        g.setEdge(edge.from, edge.to, {
            label: edge.label || '',
            width: edge.label ? measureTextWidth(edge.label) + 16 : 0,
            height: edge.label ? 20 : 0,
            labelpos: 'c',
        });
    }

    // Run layout
    dagre.layout(g);

    return extractLayoutResult(g, graphModel);
}
```

### Pattern 2: SVG Shape Registry

**What:** A mapping from NodeShape to an SVG drawing function. Each function returns an SVG element.
**When to use:** When rendering node shapes in svg-renderer.js.

```javascript
// static/svg-shapes.js

var NS = 'http://www.w3.org/2000/svg';

var SHAPE_RENDERERS = {
    rect: function(w, h) {
        var el = document.createElementNS(NS, 'rect');
        el.setAttribute('x', String(-w / 2));
        el.setAttribute('y', String(-h / 2));
        el.setAttribute('width', String(w));
        el.setAttribute('height', String(h));
        el.setAttribute('rx', '0');
        return el;
    },
    rounded: function(w, h) {
        var el = document.createElementNS(NS, 'rect');
        el.setAttribute('x', String(-w / 2));
        el.setAttribute('y', String(-h / 2));
        el.setAttribute('width', String(w));
        el.setAttribute('height', String(h));
        el.setAttribute('rx', '8');
        return el;
    },
    stadium: function(w, h) {
        var el = document.createElementNS(NS, 'rect');
        el.setAttribute('x', String(-w / 2));
        el.setAttribute('y', String(-h / 2));
        el.setAttribute('width', String(w));
        el.setAttribute('height', String(h));
        el.setAttribute('rx', String(h / 2));  // fully rounded ends
        return el;
    },
    diamond: function(w, h) {
        var el = document.createElementNS(NS, 'polygon');
        var points = '0,' + (-h/2) + ' ' + (w/2) + ',0 0,' + (h/2) + ' ' + (-w/2) + ',0';
        el.setAttribute('points', points);
        return el;
    },
    circle: function(w, h) {
        var el = document.createElementNS(NS, 'circle');
        var r = Math.max(w, h) / 2;
        el.setAttribute('r', String(r));
        return el;
    },
    hexagon: function(w, h) {
        var el = document.createElementNS(NS, 'polygon');
        var dx = h / 4;  // hexagon indent
        var points = [
            (-w/2 + dx) + ',' + (-h/2),
            (w/2 - dx) + ',' + (-h/2),
            (w/2) + ',0',
            (w/2 - dx) + ',' + (h/2),
            (-w/2 + dx) + ',' + (h/2),
            (-w/2) + ',0'
        ].join(' ');
        el.setAttribute('points', points);
        return el;
    },
    // ... cylinder, subroutine, asymmetric, parallelogram, trapezoid, etc.
};
```

### Pattern 3: ViewportTransform Class

**What:** Encapsulates zoom/pan state and provides screen <-> graph coordinate conversion.
**When to use:** For hit testing (clicks), coordinate conversion for future drag operations, zoom-to-fit.

```javascript
// static/viewport-transform.js

function ViewportTransform() {
    this.x = 0;       // pan offset X (screen pixels)
    this.y = 0;       // pan offset Y (screen pixels)
    this.zoom = 1;    // scale factor
}

ViewportTransform.prototype.screenToGraph = function(screenX, screenY) {
    return {
        x: (screenX - this.x) / this.zoom,
        y: (screenY - this.y) / this.zoom,
    };
};

ViewportTransform.prototype.graphToScreen = function(graphX, graphY) {
    return {
        x: graphX * this.zoom + this.x,
        y: graphY * this.zoom + this.y,
    };
};

ViewportTransform.prototype.zoomToFit = function(graphWidth, graphHeight, containerWidth, containerHeight) {
    var padFraction = 0.92;
    var scaleX = (containerWidth * padFraction) / graphWidth;
    var scaleY = (containerHeight * padFraction) / graphHeight;
    this.zoom = Math.min(scaleX, scaleY, 2.5);
    this.x = (containerWidth - graphWidth * this.zoom) / 2;
    this.y = (containerHeight - graphHeight * this.zoom) / 2;
};

ViewportTransform.prototype.applyToElement = function(element) {
    element.style.transform = 'translate(' + this.x + 'px, ' + this.y + 'px) scale(' + this.zoom + ')';
};
```

### Pattern 4: Edge Path Generation from Dagre Control Points

**What:** Convert dagre edge control points into SVG path `d` attribute using cubic bezier curves.
**When to use:** When rendering edges in svg-renderer.js.

```javascript
// Generate SVG path d attribute from dagre edge points
function edgePointsToPath(points) {
    if (!points || points.length === 0) return '';
    var d = 'M ' + points[0].x + ' ' + points[0].y;
    if (points.length === 2) {
        // Simple line
        d += ' L ' + points[1].x + ' ' + points[1].y;
    } else {
        // Cubic bezier through control points
        for (var i = 1; i < points.length - 1; i += 2) {
            var cp1 = points[i];
            var cp2 = points[Math.min(i + 1, points.length - 1)];
            var end = points[Math.min(i + 2, points.length - 1)];
            d += ' C ' + cp1.x + ' ' + cp1.y + ', ' + cp2.x + ' ' + cp2.y + ', ' + end.x + ' ' + end.y;
        }
        // If odd number of remaining points, finish with a line
        if ((points.length - 1) % 2 === 1) {
            var last = points[points.length - 1];
            d += ' L ' + last.x + ' ' + last.y;
        }
    }
    return d;
}
```

### Pattern 5: Text Measurement via Hidden Canvas

**What:** Measure text dimensions before dagre layout using Canvas 2D context.
**When to use:** Before calling dagre.layout() to provide width/height for each node.

```javascript
// Cached canvas for text measurement
var _measureCanvas = null;
function getMeasureContext() {
    if (!_measureCanvas) {
        _measureCanvas = document.createElement('canvas');
    }
    return _measureCanvas.getContext('2d');
}

function measureTextWidth(text, fontSize, fontFamily) {
    var ctx = getMeasureContext();
    ctx.font = (fontSize || '15px') + ' ' + (fontFamily || "'Inter', sans-serif");
    return ctx.measureText(text).width;
}

function measureNodeDimensions(label, shape) {
    var textWidth = measureTextWidth(label);
    var paddingX = 32;  // horizontal padding inside node
    var paddingY = 24;  // vertical padding inside node
    var width = textWidth + paddingX;
    var height = 24 + paddingY;  // 24 ~= line height

    // Shape-specific adjustments
    if (shape === 'circle') {
        var diameter = Math.max(width, height) + 8;
        width = diameter;
        height = diameter;
    } else if (shape === 'diamond') {
        // Diamond needs more space because content is rotated 45deg conceptually
        width = width * 1.4;
        height = height * 1.4;
    } else if (shape === 'hexagon') {
        width += height / 2;  // extra width for hexagon points
    }

    return { width: width, height: height };
}
```

### Pattern 6: Arrow Marker Definitions

**What:** SVG `<defs>` block with reusable arrow markers for different edge types.
**When to use:** Inserted once into the custom SVG container.

```javascript
function createArrowMarkers(svgDefs) {
    var NS = 'http://www.w3.org/2000/svg';
    var markers = [
        { id: 'arrow-normal', color: '#6b7280', size: 8 },
        { id: 'arrow-thick', color: '#6b7280', size: 10 },
    ];
    for (var i = 0; i < markers.length; i++) {
        var m = markers[i];
        var marker = document.createElementNS(NS, 'marker');
        marker.setAttribute('id', m.id);
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '10');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', String(m.size));
        marker.setAttribute('markerHeight', String(m.size));
        marker.setAttribute('orient', 'auto-start-reverse');
        var polygon = document.createElementNS(NS, 'polygon');
        polygon.setAttribute('points', '0 0, 10 5, 0 10');
        polygon.setAttribute('fill', m.color);
        marker.appendChild(polygon);
        svgDefs.appendChild(marker);
    }
}
```

### Anti-Patterns to Avoid

- **Rendering SVG via innerHTML/string concatenation:** Never build SVG as a string and set innerHTML. Use `document.createElementNS('http://www.w3.org/2000/svg', ...)` for proper namespace handling. String SVG breaks event listeners and is an XSS vector.

- **Caching SVG element references across renders:** Just like Mermaid (noted in diagram-dom.js), the custom renderer replaces the entire SVG on each render. Never cache node `<g>` references -- always query fresh from the DOM.

- **Running dagre layout on every minor change:** Dagre layout is O(|V| + |E|) but has constant overhead (~5-15ms for typical diagrams). Cache the layout result and only recompute when the graph model changes structurally (nodes added/removed, edges changed), not on zoom/pan.

- **Trying to match Mermaid pixel-for-pixel:** The success criterion is "visually similar," not identical. Dagre will produce different positions than Mermaid's internal dagre usage because Mermaid adds its own spacing/padding. Focus on correct topology and readable layout, not pixel matching.

- **Using SVG transforms for zoom/pan on the container:** The existing pan-zoom.js uses CSS transforms on the `#preview` div. The custom renderer should work with the same mechanism -- the SVG itself has no viewBox zoom, all zoom is CSS transform on the parent. This ensures the existing pan-zoom module works without modification.

- **Implementing compound graph edges TO clusters:** Dagre has a known bug where edges to/from cluster (subgraph) nodes cause `TypeError: Cannot set property 'rank' of undefined`. For edges that reference subgraph IDs, connect them to a representative node within the subgraph instead.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph layout (node positioning) | Custom force-directed or hierarchical layout | dagre `layout(g)` | Graph layout is a solved problem with dozens of edge cases (cycle breaking, crossing minimization, rank assignment). Dagre handles all of this in 30KB. |
| Edge routing (path computation) | Custom edge routing between nodes | dagre `edge.points` | Dagre computes control points that avoid node overlaps and handle multi-segment paths. |
| Text width measurement | Character counting or fixed-width estimates | Canvas `measureText()` | Character widths vary by font; proportional fonts make counting useless. `measureText()` uses the actual font metrics. |
| SVG viewBox math | Custom coordinate system | CSS transform (existing `pan-zoom.js`) | The existing pan-zoom already handles zoom-toward-cursor, trackpad sensitivity, and fit-to-view. The custom renderer just needs to produce an SVG that the existing system transforms. |
| Subgraph nesting/bounding boxes | Manual bounding box calculation | dagre compound graph `setParent()` + `g.node(sgId)` | Dagre computes bounding boxes for compound nodes (clusters) that properly encompass child nodes with padding. |

**Key insight:** Dagre does the hard work (layout + edge routing). The custom renderer's job is essentially: measure text -> feed dagre -> read positions -> draw SVG elements at those positions. The drawing part is straightforward native SVG DOM manipulation.

## Common Pitfalls

### Pitfall 1: Dagre Requires Width/Height Before Layout

**What goes wrong:** Dagre's `setNode()` requires `width` and `height` properties. If you pass 0 or omit them, all nodes stack on top of each other.
**Why it happens:** Dagre computes positions assuming the provided dimensions. It does not measure anything itself -- it is purely a layout algorithm.
**How to avoid:** Before calling `dagre.layout(g)`, measure every node's text using Canvas `measureText()` with the same font/size the SVG will use. Add padding for shape borders and internal spacing. Cache the measurement canvas context -- creating a new canvas per node is wasteful.
**Warning signs:** All nodes rendered at the same position; nodes overlapping; edges all converging to one point.

### Pitfall 2: SVG Namespace Requirement

**What goes wrong:** `document.createElement('rect')` creates an HTML `<rect>` element, not an SVG one. It renders as nothing. Must use `document.createElementNS('http://www.w3.org/2000/svg', 'rect')`.
**Why it happens:** SVG elements live in a different XML namespace than HTML elements. The browser needs the namespace to know how to render them.
**How to avoid:** Define `var NS = 'http://www.w3.org/2000/svg'` at the top of each SVG-creating module. Always use `createElementNS(NS, tagName)`. This is easy to forget and causes silent failures.
**Warning signs:** Elements exist in DOM but are invisible; `getBBox()` throws errors; shapes don't render.

### Pitfall 3: Dagre Compound Graph Subgraph-Edge Bug

**What goes wrong:** Adding an edge where one endpoint is a subgraph (cluster) node causes `TypeError: Cannot set property 'rank' of undefined` in dagre.
**Why it happens:** Dagre has a long-standing bug (#238) where edges to/from parent nodes in compound graphs fail during the rank assignment phase.
**How to avoid:** During the layout phase, if an edge's `from` or `to` is a subgraph ID, redirect it to a representative node within that subgraph (e.g., the first node in `sg.nodeIds`). Store the original subgraph endpoint so the SVG renderer can draw the edge to the subgraph boundary instead.
**Warning signs:** Runtime error during `dagre.layout(g)` call; diagram fails to render for files with subgraph-to-node edges.

### Pitfall 4: Coordinate System Mismatch

**What goes wrong:** Dagre reports node positions as center-point (x, y), but SVG `<rect>` draws from top-left corner. Nodes appear offset by half their width and height.
**Why it happens:** Dagre's output `x` and `y` for nodes represent the center of the node bounding box. SVG `<rect>` x/y attributes are the top-left corner.
**How to avoid:** When rendering nodes, use SVG `<g>` group with `transform="translate(x, y)"` and then draw shape elements centered at origin (e.g., `<rect x="-w/2" y="-h/2" width="w" height="h">`). This is the standard dagre rendering pattern.
**Warning signs:** All shapes appear shifted to the bottom-right; edges don't connect to shape centers.

### Pitfall 5: Edge Arrow Marker Alignment

**What goes wrong:** Arrow markers rendered via `marker-end="url(#arrowhead)"` are clipped by the target node because the edge path goes to the node center, and the arrowhead extends past the node boundary.
**Why it happens:** Dagre edge points end at the node center. The SVG marker is appended at the path endpoint, which is inside the node.
**How to avoid:** Shorten the last edge segment so it stops at the node boundary, not center. Calculate the intersection of the edge path with the target node's shape boundary (for rect: simple clamp; for circle: radius offset; for diamond: line-polygon intersection). Apply this offset to the last point before generating the path `d` attribute.
**Warning signs:** Arrowheads hidden behind nodes; arrows appear to "stab into" nodes; arrows visible on some edges but not others.

### Pitfall 6: Font Measurement Mismatch

**What goes wrong:** Node dimensions computed with `measureText()` don't match the actual rendered text, causing text to overflow or nodes to be too large.
**Why it happens:** The Canvas font string must exactly match the CSS font used in the SVG. If the font hasn't loaded yet, the browser substitutes a fallback font with different metrics.
**How to avoid:** Ensure the font (Inter) is loaded before measuring. Use `document.fonts.ready.then(...)` or check `document.fonts.check('15px Inter')`. The existing live.html already preloads Inter via Google Fonts. Use the exact same font string in both Canvas context and SVG text elements: `'600 15px Inter, sans-serif'`.
**Warning signs:** Node text overflows shape boundaries on first render but looks fine on subsequent renders (after font loads).

### Pitfall 7: CSS Transform Interaction with SVG viewBox

**What goes wrong:** If the custom SVG has a `viewBox` attribute, the CSS `transform: scale()` from pan-zoom.js compounds with the SVG's internal scaling, causing double-zoom.
**Why it happens:** SVG `viewBox` defines an internal coordinate system with its own scaling. CSS transform adds another layer. They multiply.
**How to avoid:** The custom SVG should NOT use a `viewBox` attribute. Set explicit `width` and `height` attributes matching the dagre graph dimensions. Let `pan-zoom.js` handle all zoom/pan via CSS transform on the `#preview` div, exactly as it does for Mermaid SVGs. The custom SVG is just a fixed-size drawing that the existing zoom system transforms.
**Warning signs:** Zoom behaves erratically; zoom-to-fit calculates wrong dimensions; zoom-toward-cursor offset is wrong.

## Code Examples

### Complete Custom Renderer Orchestrator

```javascript
// static/custom-renderer.js

(function() {
    'use strict';

    /**
     * Render a GraphModel JSON object to SVG in the #preview container.
     * Parallel to SmartBRenderer.render(code) for Mermaid.
     */
    async function render(graphModel) {
        if (!graphModel || !graphModel.nodes) return;

        // 1. Compute layout with dagre
        var layout = SmartBDagreLayout.computeLayout(graphModel);

        // 2. Generate SVG DOM
        var svg = SmartBSvgRenderer.createSVG(layout);

        // 3. Insert into preview container
        var preview = document.getElementById('preview');
        preview.textContent = '';
        preview.appendChild(svg);

        // 4. Apply existing pan-zoom transform
        if (window.applyTransform) window.applyTransform();

        // 5. Auto-fit on initial render
        if (SmartBRenderer.getInitialRender()) {
            requestAnimationFrame(function() {
                if (window.zoomFit) window.zoomFit();
            });
            SmartBRenderer.setInitialRender(false);
        }

        // 6. Emit rendered event for downstream modules
        if (window.SmartBEventBus) {
            SmartBEventBus.emit('diagram:rendered', { svg: svg.outerHTML, renderer: 'custom' });
        }
    }

    window.SmartBCustomRenderer = {
        render: render,
    };
})();
```

### Renderer Toggle via Query Parameter

```javascript
// In app-init.js bootstrap, detect renderer preference
var params = new URLSearchParams(window.location.search);
var rendererType = params.get('renderer') || 'mermaid';

// In the WebSocket file:changed handler and initial load:
if (rendererType === 'custom') {
    // Fetch graph model from server API (Phase 12 endpoint)
    // For Phase 11, we can parse locally for testing
    var graphModel = parseGraphModelFromMermaid(text);
    SmartBCustomRenderer.render(graphModel);
} else {
    SmartBRenderer.render(text);
}
```

### SVG Node Rendering with Data Attributes

```javascript
// Render a single node as an SVG <g> group
function renderNode(node, layout) {
    var NS = 'http://www.w3.org/2000/svg';
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('data-node-id', node.id);
    g.setAttribute('class', 'smartb-node');
    g.setAttribute('transform', 'translate(' + layout.x + ',' + layout.y + ')');

    // Draw shape
    var shape = SmartBSvgShapes.render(node.shape, layout.width, layout.height);
    shape.setAttribute('class', 'smartb-node-shape');
    shape.setAttribute('fill', '#eef2ff');
    shape.setAttribute('stroke', '#4f46e5');
    shape.setAttribute('stroke-width', '2');
    g.appendChild(shape);

    // Draw label
    var text = document.createElementNS(NS, 'text');
    text.setAttribute('class', 'smartb-node-label');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('fill', '#1e1b4b');
    text.setAttribute('font-family', "'Inter', sans-serif");
    text.setAttribute('font-size', '15');
    text.setAttribute('font-weight', '600');
    text.textContent = node.label;
    g.appendChild(text);

    return g;
}
```

### Edge Rendering with Arrow Markers

```javascript
function renderEdge(edge, points, edgeType) {
    var NS = 'http://www.w3.org/2000/svg';
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('data-edge-id', edge.id);
    g.setAttribute('class', 'smartb-edge');

    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', edgePointsToPath(points));
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#6b7280');

    // Edge type styling
    switch (edgeType) {
        case 'thick':
            path.setAttribute('stroke-width', '3');
            path.setAttribute('marker-end', 'url(#arrow-thick)');
            break;
        case 'dotted':
            path.setAttribute('stroke-width', '1.5');
            path.setAttribute('stroke-dasharray', '5,5');
            path.setAttribute('marker-end', 'url(#arrow-normal)');
            break;
        case 'open':
            path.setAttribute('stroke-width', '1.5');
            // No marker-end (no arrowhead)
            break;
        case 'invisible':
            path.setAttribute('stroke', 'none');
            break;
        default: // 'arrow'
            path.setAttribute('stroke-width', '1.5');
            path.setAttribute('marker-end', 'url(#arrow-normal)');
    }

    g.appendChild(path);

    // Edge label (if present)
    if (edge.label) {
        var labelG = renderEdgeLabel(edge.label, points);
        g.appendChild(labelG);
    }

    return g;
}
```

### Subgraph Rendering as Background Rectangle

```javascript
function renderSubgraph(sg, dagreNode) {
    var NS = 'http://www.w3.org/2000/svg';
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('data-subgraph-id', sg.id);
    g.setAttribute('class', 'smartb-subgraph');

    // dagre node gives center-point x,y and width,height
    var x = dagreNode.x - dagreNode.width / 2;
    var y = dagreNode.y - dagreNode.height / 2;

    // Background rectangle
    var rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(dagreNode.width));
    rect.setAttribute('height', String(dagreNode.height));
    rect.setAttribute('rx', '8');
    rect.setAttribute('fill', '#f8fafc');
    rect.setAttribute('stroke', '#cbd5e1');
    rect.setAttribute('stroke-width', '1');
    g.appendChild(rect);

    // Label at top of subgraph
    var text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(dagreNode.x));
    text.setAttribute('y', String(y + 20));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('fill', '#1e293b');
    text.setAttribute('font-family', "'Inter', sans-serif");
    text.setAttribute('font-size', '17');
    text.setAttribute('font-weight', '700');
    text.textContent = sg.label;
    g.appendChild(text);

    return g;
}
```

## GraphModel JSON Wire Format

The GraphModel uses Maps on the server (TypeScript), but JSON serialization requires conversion. Phase 12 will add the API endpoint; for Phase 11 development/testing, the conversion is:

```javascript
// Server-side: Map -> Object for JSON
function graphModelToJSON(graph) {
    return {
        diagramType: graph.diagramType,
        direction: graph.direction,
        nodes: Object.fromEntries(graph.nodes),
        edges: graph.edges,
        subgraphs: Object.fromEntries(graph.subgraphs),
        classDefs: Object.fromEntries(graph.classDefs),
        nodeStyles: Object.fromEntries(graph.nodeStyles),
        linkStyles: Object.fromEntries(graph.linkStyles),
        classAssignments: Object.fromEntries(graph.classAssignments),
        filePath: graph.filePath,
    };
}
```

For Phase 11, before the Phase 12 API endpoint exists, the custom renderer can parse Mermaid client-side using a simplified parser (or the `.mmd` text can be sent to the server and the graph model returned). The recommended approach for Phase 11 testing is to embed a lightweight client-side parser that extracts enough structure for layout, or to hard-code a few test graph models.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Mermaid.js opaque `render()` | Custom dagre + SVG pipeline alongside Mermaid | Phase 11 (this phase) | Enables direct SVG manipulation, `data-*` attributes, custom interactions |
| dagre 0.8.5 (unmaintained) | @dagrejs/dagre 2.0.4 (active, ESM support) | 2024 | Active maintenance, ESM/UMD builds, bug fixes, modern JS |
| D3-based dagre rendering | Native SVG DOM rendering (no D3) | Modern best practice | Zero dependency rendering; D3 is overkill for programmatic SVG creation |
| Single renderer | Strangler fig: Mermaid + custom side by side | Phase 11 (this phase) | Backward compatibility; gradual migration; easy rollback |

**Deprecated/outdated:**
- `dagre` (unscoped npm package): version 0.8.5, last published 6 years ago. Use `@dagrejs/dagre` instead.
- `dagre-d3`: Requires D3.js. Use dagre (layout only) + native SVG DOM instead.

## File Size Estimates

| File | Estimated Lines | Under 500? |
|------|-----------------|------------|
| `static/dagre-layout.js` | ~180-220 | Yes |
| `static/svg-renderer.js` | ~200-250 | Yes |
| `static/svg-shapes.js` | ~200-280 | Yes (13 shapes + helpers) |
| `static/viewport-transform.js` | ~80-120 | Yes |
| `static/custom-renderer.js` | ~80-120 | Yes (orchestrator) |
| `static/live.html` (modified) | ~150 (from 144) | Yes |
| `static/diagram-dom.js` (modified) | ~170 (from 152) | Yes |
| `static/app-init.js` (modified) | ~290 (from 277) | Yes |

**Risk:** `svg-shapes.js` could approach 300 lines with all 13 shapes. If so, each shape is a small function (8-15 lines) so the file stays manageable. If it exceeds 350 lines, split into `svg-shapes-basic.js` (rect, rounded, circle, diamond, stadium) and `svg-shapes-advanced.js` (hexagon, cylinder, parallelogram variants, trapezoid variants, subroutine, asymmetric).

## Testing Strategy

Phase 11 is primarily browser-side code (vanilla JS in `static/`). The existing Vitest test suite runs in Node.js and cannot test DOM/SVG rendering. Testing approaches:

1. **ViewportTransform** -- Pure math, testable in Vitest: `screenToGraph()`, `graphToScreen()`, `zoomToFit()`. This is the one module that can have full automated tests.

2. **dagre-layout.js** -- The dagre graph construction logic can be tested in Vitest by importing dagre as an npm dev dependency and verifying that layout produces expected positions for known inputs.

3. **SVG rendering** -- Manual visual testing with `?renderer=custom` in the browser. Compare against Mermaid output for the same `.mmd` file.

4. **Integration** -- Open the live viewer with `?renderer=custom`, load various `.mmd` files from test fixtures, verify topology matches (same connections), shapes are correct, zoom/pan works.

## Open Questions

1. **How to bootstrap Phase 11 without Phase 12's API endpoint?**
   - What we know: The custom renderer needs a GraphModel JSON object. Phase 12 adds `GET /api/graph/:file` but that does not exist yet.
   - What's unclear: Whether to build a temporary client-side parser, a temporary server endpoint, or embed test data.
   - Recommendation: Add a minimal `/api/graph/:file` endpoint in Phase 11 that calls `service.readGraph(file)` and returns JSON. This is 10-15 lines of code in `routes.ts` and gives the browser access to GraphModel without a full Phase 12 implementation. It also serves as a prototype for Phase 12 to refine.

2. **Should classDef styles be applied to custom SVG nodes?**
   - What we know: The GraphModel has `classDefs` (CSS properties as strings) and `classAssignments` (nodeId -> className). These are Mermaid-specific CSS like `fill:#f9f,stroke:#333`.
   - What's unclear: Whether to parse these CSS strings and apply them as SVG attributes, or ignore them and use a default theme.
   - Recommendation: For Phase 11, apply a default theme (matching the existing Mermaid theme colors in `renderer.js MERMAID_CONFIG`). Parse and apply classDef styles as a stretch goal. The core success criteria do not mention classDef support.

3. **Should the custom renderer handle status colors (ok/problem/in-progress/discarded)?**
   - What we know: `renderer.js injectStatusStyles()` adds classDef directives to the Mermaid source. For the custom renderer, status colors need to be applied differently -- directly to SVG fill attributes.
   - What's unclear: Whether Phase 11 or Phase 12 handles this integration.
   - Recommendation: Defer to Phase 12. Phase 11 focuses on correct layout and shape rendering. Phase 12 integrates with existing annotation/status modules.

4. **What happens to existing modules (annotations, search, collapse) with the custom renderer?**
   - What we know: These modules use `DiagramDOM` to query the SVG. The custom renderer will produce different SVG structure than Mermaid.
   - What's unclear: Whether `DiagramDOM` needs updates in Phase 11 or Phase 12.
   - Recommendation: Add `data-node-id`, `data-edge-id`, `data-subgraph-id` attributes to custom SVG elements. Update `DiagramDOM` with a `getRendererType()` check and add alternate query paths for custom SVG. Full integration is Phase 12 scope, but the `data-*` attributes must be in place from Phase 11.

## Sources

### Primary (HIGH confidence)
- Context7 `/dagrejs/dagre` -- dagre API: setNode, setEdge, setGraph, layout(), graph config (rankdir, nodesep, ranksep), node output (x, y, width, height), edge output (points array), compound graph with setParent
- `@dagrejs/dagre` npm package (v2.0.4) -- actively maintained, MIT license, 426K weekly downloads
- jsDelivr CDN -- `https://cdn.jsdelivr.net/npm/@dagrejs/dagre@2.0.4/dist/dagre.min.js`
- MDN SVG Paths reference -- cubic bezier C command, marker-end attribute, createElementNS API
- Existing codebase: `src/diagram/graph-types.ts` -- GraphModel types, 13 NodeShape values, 5 EdgeType values
- Existing codebase: `static/renderer.js` -- Mermaid rendering pipeline, MERMAID_CONFIG theme
- Existing codebase: `static/pan-zoom.js` -- viewport transform implementation, CSS transform approach
- Existing codebase: `static/diagram-dom.js` -- SVG DOM abstraction layer, ID patterns

### Secondary (MEDIUM confidence)
- Steve Ruiz "Creating a Zoom UI" -- screen-to-canvas coordinate conversion formulas
- David Hamann "SVG Viewport to Element Coordinates" -- SVG transform matrix handling
- dagre-d3 clusters demo -- compound graph setParent usage pattern
- Bundlephobia `@dagrejs/dagre` -- bundle size analysis

### Tertiary (LOW confidence)
- dagre GitHub issue #238 -- compound graph edge-to-parent bug (confirmed by multiple users but fix status unclear in v2.0.4)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- dagre is the established choice (same as Mermaid), native SVG DOM is standard, no alternatives are better for this use case
- Architecture: HIGH -- strangler fig pattern is well-defined in the project roadmap; module structure follows existing codebase conventions; all modules under 500 lines
- Pitfalls: HIGH -- identified from dagre API documentation, known GitHub issues, and SVG rendering experience; the compound graph bug is the highest-risk item
- Rendering fidelity: MEDIUM -- "visually similar to Mermaid" is subjective; dagre will produce different layouts than Mermaid's internal dagre usage due to different padding/spacing parameters; tuning will be needed
- Testing: MEDIUM -- browser-side rendering cannot be automatically tested in Vitest; ViewportTransform and dagre layout logic can be tested, but visual output requires manual verification

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (stable -- dagre API is mature, SVG DOM API is browser standard)
