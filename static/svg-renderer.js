/**
 * SmartB SVG Renderer -- assembles complete SVG DOM from a LayoutResult.
 * Renders nodes (with shapes), edges (with arrows), and subgraphs.
 *
 * Dependencies: svg-shapes.js (SmartBSvgShapes)
 * Dependents: (future) custom-renderer-bridge.js
 *
 * Usage:
 *   var svgEl = SmartBSvgRenderer.createSVG(layout);
 *   container.appendChild(svgEl);
 */
(function() {
    'use strict';

    var NS = 'http://www.w3.org/2000/svg';

    // ── Theme constants (matching renderer.js MERMAID_CONFIG themeVariables) ──
    var THEME = {
        nodeFill: '#eef2ff',
        nodeStroke: '#4f46e5',
        nodeStrokeWidth: '2',
        nodeTextColor: '#1e1b4b',
        nodeFontSize: '15',
        nodeFontWeight: '600',
        nodeFontFamily: "'Inter', sans-serif",
        edgeStroke: '#6b7280',
        edgeStrokeWidth: '1.5',
        edgeLabelBg: '#ffffff',
        edgeLabelColor: '#6b7280',
        edgeLabelFontSize: '13',
        subgraphFill: '#f8fafc',
        subgraphStroke: '#cbd5e1',
        subgraphStrokeWidth: '1',
        subgraphLabelColor: '#1e293b',
        subgraphLabelFontSize: '14',
        subgraphLabelFontWeight: '700'
    };

    function el(tag) { return document.createElementNS(NS, tag); }

    function attrs(element, map) {
        for (var key in map) {
            if (map.hasOwnProperty(key)) element.setAttribute(key, String(map[key]));
        }
        return element;
    }

    // ── Arrow Markers ──
    function createArrowMarkers(defs) {
        var sizes = { 'arrow-normal': 8, 'arrow-thick': 10, 'arrow-dotted': 8 };
        for (var id in sizes) {
            if (!sizes.hasOwnProperty(id)) continue;
            var marker = attrs(el('marker'), {
                id: id, viewBox: '0 0 10 10', refX: 10, refY: 5,
                markerWidth: sizes[id], markerHeight: sizes[id],
                orient: 'auto-start-reverse'
            });
            var arrow = el('polygon');
            arrow.setAttribute('points', '0 0, 10 5, 0 10');
            arrow.setAttribute('fill', THEME.edgeStroke);
            marker.appendChild(arrow);
            defs.appendChild(marker);
        }
    }

    // ── Edge path construction ──
    function edgePointsToPath(points) {
        if (!points || points.length === 0) return '';
        var d = 'M ' + points[0].x + ' ' + points[0].y;
        if (points.length === 2) {
            d += ' L ' + points[1].x + ' ' + points[1].y;
        } else if (points.length >= 3) {
            var idx = 1;
            while (idx + 2 < points.length) {
                d += ' C ' + points[idx].x + ' ' + points[idx].y
                    + ', ' + points[idx + 1].x + ' ' + points[idx + 1].y
                    + ', ' + points[idx + 2].x + ' ' + points[idx + 2].y;
                idx += 3;
            }
            while (idx < points.length) {
                d += ' L ' + points[idx].x + ' ' + points[idx].y;
                idx++;
            }
        }
        return d;
    }

    // ── Helper: clamp endpoint to rectangle boundary ──
    function clampToRect(from, cx, cy, hw, hh) {
        var dx = cx - from.x;
        var dy = cy - from.y;
        if (dx === 0 && dy === 0) return { x: cx, y: cy - hh };
        var absDx = Math.abs(dx);
        var absDy = Math.abs(dy);
        var t = (absDx * hh > absDy * hw) ? hw / absDx : hh / absDy;
        return { x: cx - dx * t, y: cy - dy * t };
    }

    // ── Shorten path to node boundary ──
    function shortenPathToNodeBoundary(points, targetNode) {
        if (!points || points.length < 2 || !targetNode) return points;
        var result = [];
        for (var i = 0; i < points.length; i++) {
            result.push({ x: points[i].x, y: points[i].y });
        }
        var prev = result[result.length - 2];
        var dx = result[result.length - 1].x - prev.x;
        var dy = result[result.length - 1].y - prev.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return result;

        var nx = targetNode.x, ny = targetNode.y;
        var nw = targetNode.width / 2, nh = targetNode.height / 2;
        var shape = targetNode.shape || 'rect';

        if (shape === 'circle') {
            var r = Math.max(targetNode.width, targetNode.height) / 2;
            result[result.length - 1] = { x: nx - (dx / dist) * r, y: ny - (dy / dist) * r };
        } else if (shape === 'diamond') {
            result[result.length - 1] = clampToRect(prev, nx, ny, nw * 0.7, nh * 0.7);
        } else {
            result[result.length - 1] = clampToRect(prev, nx, ny, nw, nh);
        }
        return result;
    }

    // ── Render a single node ──
    function renderNode(node) {
        var g = el('g');
        g.setAttribute('data-node-id', node.id);
        g.setAttribute('class', 'smartb-node');
        g.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');

        var shapeEl = window.SmartBSvgShapes.render(node.shape, node.width, node.height);
        attrs(shapeEl, { fill: THEME.nodeFill, stroke: THEME.nodeStroke, 'stroke-width': THEME.nodeStrokeWidth });

        // For subroutine <g>, apply styles to child elements individually
        if (node.shape === 'subroutine' && shapeEl.tagName === 'g') {
            var children = shapeEl.childNodes;
            for (var c = 0; c < children.length; c++) {
                if (children[c].nodeType === 1) {
                    attrs(children[c], {
                        fill: children[c].tagName === 'rect' ? THEME.nodeFill : 'none',
                        stroke: THEME.nodeStroke, 'stroke-width': THEME.nodeStrokeWidth
                    });
                }
            }
        }
        g.appendChild(shapeEl);

        var text = el('text');
        attrs(text, {
            'text-anchor': 'middle',
            fill: THEME.nodeTextColor, 'font-family': THEME.nodeFontFamily,
            'font-size': THEME.nodeFontSize, 'font-weight': THEME.nodeFontWeight
        });
        // Handle multiline labels: split on \n and use <tspan> per line
        var labelStr = (node.label || '').replace(/\\n/g, '\n');
        var lines = labelStr.split('\n');
        var lineHeight = parseFloat(THEME.nodeFontSize) * 1.3;
        var totalHeight = lines.length * lineHeight;
        var startY = -(totalHeight - lineHeight) / 2;
        for (var li = 0; li < lines.length; li++) {
            var tspan = el('tspan');
            tspan.setAttribute('x', '0');
            tspan.setAttribute('dy', li === 0 ? String(startY) : String(lineHeight));
            tspan.setAttribute('dominant-baseline', 'central');
            tspan.textContent = lines[li];
            text.appendChild(tspan);
        }
        g.appendChild(text);
        return g;
    }

    // ── Edge type styling ──
    function applyEdgeStyle(path, type) {
        var base = { stroke: THEME.edgeStroke, fill: 'none' };
        if (type === 'thick') {
            attrs(path, { stroke: base.stroke, 'stroke-width': '3', 'marker-end': 'url(#arrow-thick)', fill: 'none' });
        } else if (type === 'dotted') {
            attrs(path, { stroke: base.stroke, 'stroke-width': THEME.edgeStrokeWidth, 'stroke-dasharray': '5,5', 'marker-end': 'url(#arrow-normal)', fill: 'none' });
        } else if (type === 'open') {
            attrs(path, { stroke: base.stroke, 'stroke-width': THEME.edgeStrokeWidth, fill: 'none' });
        } else if (type === 'invisible') {
            attrs(path, { stroke: 'none', fill: 'none' });
        } else {
            // Default: arrow
            attrs(path, { stroke: base.stroke, 'stroke-width': THEME.edgeStrokeWidth, 'marker-end': 'url(#arrow-normal)', fill: 'none' });
        }
    }

    // ── Render a single edge ──
    function renderEdge(edge, nodesMap) {
        var g = el('g');
        g.setAttribute('data-edge-id', edge.id);
        g.setAttribute('class', 'smartb-edge');

        var targetNode = nodesMap[edge.to];
        var points = targetNode ? shortenPathToNodeBoundary(edge.points, targetNode) : edge.points;

        var path = el('path');
        path.setAttribute('d', edgePointsToPath(points));
        applyEdgeStyle(path, edge.type);
        g.appendChild(path);

        // Optional label at midpoint
        if (edge.label) {
            var midPt = points[Math.floor(points.length / 2)] || points[0];
            var labelGroup = el('g');
            labelGroup.setAttribute('transform', 'translate(' + midPt.x + ',' + midPt.y + ')');

            var textLen = edge.label.length * 7 + 12;
            labelGroup.appendChild(attrs(el('rect'), {
                x: -textLen / 2, y: -10, width: textLen, height: 20,
                rx: 4, fill: THEME.edgeLabelBg, stroke: 'none'
            }));

            var labelText = el('text');
            attrs(labelText, {
                'text-anchor': 'middle', 'dominant-baseline': 'central',
                fill: THEME.edgeLabelColor, 'font-family': THEME.nodeFontFamily,
                'font-size': THEME.edgeLabelFontSize
            });
            labelText.textContent = edge.label;
            labelGroup.appendChild(labelText);
            g.appendChild(labelGroup);
        }
        return g;
    }

    // ── Render a subgraph ──
    function renderSubgraph(sg) {
        var g = el('g');
        g.setAttribute('data-subgraph-id', sg.id);
        g.setAttribute('class', 'smartb-subgraph');

        g.appendChild(attrs(el('rect'), {
            x: sg.x - sg.width / 2, y: sg.y - sg.height / 2,
            width: sg.width, height: sg.height, rx: 8,
            fill: THEME.subgraphFill, stroke: THEME.subgraphStroke,
            'stroke-width': THEME.subgraphStrokeWidth
        }));

        var text = el('text');
        attrs(text, {
            x: sg.x, y: sg.y - sg.height / 2 + 20,
            'text-anchor': 'middle', 'dominant-baseline': 'central',
            fill: THEME.subgraphLabelColor, 'font-family': THEME.nodeFontFamily,
            'font-size': THEME.subgraphLabelFontSize, 'font-weight': THEME.subgraphLabelFontWeight
        });
        text.textContent = sg.label;
        g.appendChild(text);
        return g;
    }

    // ── Main: create complete SVG from LayoutResult ──
    function createSVG(layout) {
        var svg = attrs(el('svg'), {
            xmlns: NS,
            width: '100%',
            height: '100%',
            viewBox: '0 0 ' + layout.width + ' ' + layout.height
        });

        var defs = el('defs');
        createArrowMarkers(defs);
        svg.appendChild(defs);

        var root = el('g');
        root.setAttribute('class', 'smartb-diagram');

        // Build nodes map for edge boundary calculations
        var nodesMap = {};
        for (var n = 0; n < layout.nodes.length; n++) {
            nodesMap[layout.nodes[n].id] = layout.nodes[n];
        }

        // 1. Subgraphs first (behind everything)
        for (var s = 0; s < layout.subgraphs.length; s++) {
            root.appendChild(renderSubgraph(layout.subgraphs[s]));
        }
        // 2. Edges next (middle layer)
        for (var e = 0; e < layout.edges.length; e++) {
            root.appendChild(renderEdge(layout.edges[e], nodesMap));
        }
        // 3. Nodes last (on top)
        for (var i = 0; i < layout.nodes.length; i++) {
            root.appendChild(renderNode(layout.nodes[i]));
        }

        svg.appendChild(root);
        return svg;
    }

    // ── Public API ──
    window.SmartBSvgRenderer = { createSVG: createSVG };
})();
