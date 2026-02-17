/**
 * SmartB Annotations SVG -- SVG overlay rendering for flags.
 * Extracted from annotations.js. Exposed as window.SmartBAnnotationsSVG.
 * Dependencies: diagram-dom.js
 */
(function () {
    'use strict';

    function svgEl(ns, tag, attrs) {
        var el = document.createElementNS(ns, tag);
        Object.entries(attrs).forEach(function(p) { el.setAttribute(p[0], p[1]); });
        return el;
    }

    function addBadge(svg, element, nodeId, flagsMap) {
        var bbox = element.getBBox ? element.getBBox() : null;
        if (!bbox) return;
        var ns = 'http://www.w3.org/2000/svg';

        // Account for transform="translate(x,y)" on custom renderer nodes
        var tx = 0, ty = 0;
        var transform = element.getAttribute('transform');
        if (transform) {
            var m = transform.match(/translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
            if (m) { tx = parseFloat(m[1]); ty = parseFloat(m[2]); }
        }

        var g = svgEl(ns, 'g', { 'class': 'flag-badge' });
        var cx = tx + bbox.x + bbox.width - 2, cy = ty + bbox.y + 2;

        g.appendChild(svgEl(ns, 'circle', { cx: cx, cy: cy, r: 12, fill: '#ef4444', stroke: '#fff', 'stroke-width': 2 }));
        var bang = svgEl(ns, 'text', { x: cx, y: cy + 1, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#fff', 'font-size': 13, 'font-weight': 700, 'font-family': 'Inter, sans-serif' });
        bang.textContent = '!';
        g.appendChild(bang);

        // Flag message label with measured background
        var flagData = nodeId ? flagsMap.get(nodeId) : null;
        if (flagData && flagData.message) {
            var msg = flagData.message.length > 35 ? flagData.message.substring(0, 34) + '\u2026' : flagData.message;
            var label = svgEl(ns, 'text', { x: cx, y: cy + 24, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#fff', 'font-size': 10, 'font-weight': 600, 'font-family': "'JetBrains Mono', Inter, sans-serif" });
            label.textContent = msg;
            // Measure text by temporarily appending
            g.appendChild(label);
            svg.appendChild(g);
            var tBox = label.getBBox();
            svg.removeChild(g);
            g.removeChild(label);
            // Background pill
            var padX = 8, padY = 3;
            g.appendChild(svgEl(ns, 'rect', { x: tBox.x - padX, y: tBox.y - padY, width: tBox.width + padX * 2, height: tBox.height + padY * 2, rx: 8, fill: '#ef4444', opacity: '0.95' }));
            g.appendChild(label);
            var title = document.createElementNS(ns, 'title');
            title.textContent = 'Flag: ' + flagData.message;
            g.appendChild(title);
        }
        svg.appendChild(g);
    }

    function applyFlagsToSVG(flagsMap) {
        var svg = DiagramDOM.getSVG();
        if (!svg) return;
        svg.querySelectorAll('.flag-badge').forEach(function(b) { b.remove(); });
        svg.querySelectorAll('.flagged, .flagged-edge').forEach(function(el) {
            el.classList.remove('flagged', 'flagged-edge');
        });
        if (flagsMap.size === 0) return;

        flagsMap.forEach(function(flagVal, nodeId) {
            // Use DiagramDOM to find node and subgraph elements
            var nodeEl = DiagramDOM.findNodeElement(nodeId);
            if (nodeEl) {
                nodeEl.classList.add('flagged');
                addBadge(svg, nodeEl, nodeId, flagsMap);
                return;
            }
            var subEl = DiagramDOM.findSubgraphElement(nodeId);
            if (subEl) {
                subEl.classList.add('flagged');
                addBadge(svg, subEl, nodeId, flagsMap);
                return;
            }
            // Edge flags: check if ID starts with L- (Mermaid) or direct data-edge-id (custom)
            if (nodeId.startsWith('L-')) {
                var edgeEl = svg.querySelector('[id="' + nodeId + '"]');
                if (!edgeEl) {
                    var bareEdgeId = nodeId.substring(2);
                    edgeEl = svg.querySelector('[data-edge-id="' + bareEdgeId + '"]');
                }
                if (edgeEl) {
                    edgeEl.classList.add('flagged-edge');
                    addBadge(svg, edgeEl, nodeId, flagsMap);
                }
            } else {
                var directEdge = svg.querySelector('[data-edge-id="' + nodeId + '"]');
                if (directEdge) {
                    directEdge.classList.add('flagged-edge');
                    addBadge(svg, directEdge, nodeId, flagsMap);
                }
            }
        });
    }

    window.SmartBAnnotationsSVG = {
        applyFlagsToSVG: applyFlagsToSVG,
        addBadge: addBadge,
        svgEl: svgEl,
    };
})();
