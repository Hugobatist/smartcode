/**
 * SmartB Ghost Paths -- renders discarded reasoning branches as
 * curved dashed lines on the diagram SVG. Toggle visibility via button.
 *
 * Dependencies:
 *   - diagram-dom.js (DiagramDOM)
 *   - event-bus.js (SmartBEventBus)
 */
(function() {
    'use strict';

    var SVG_NS = 'http://www.w3.org/2000/svg';
    var LS_KEY = 'smartb-ghost-paths-visible';

    // Visual config
    var GHOST_COLOR = '#a78bfa';      // Purple — distinct from diagram blues/greens/reds
    var GHOST_OPACITY = 0.55;
    var GHOST_STROKE_W = 2;
    var GHOST_DASH = '6,4';
    var LABEL_FONT_SIZE = 10;
    var LABEL_BG_PAD_X = 6;
    var LABEL_BG_PAD_Y = 3;
    var LABEL_BG_COLOR = '#1e1b2e';   // Dark background for contrast
    var LABEL_BG_OPACITY = 0.85;
    var LABEL_MAX_CHARS = 40;
    var CURVE_OFFSET = 60;            // Bezier curve offset to avoid straight-line crossings

    // ── Module State ──
    var ghostPaths = [];
    var visible = false;

    // ── Helpers ──

    function loadVisibility() {
        try {
            var stored = localStorage.getItem(LS_KEY);
            if (stored !== null) visible = stored === 'true';
        } catch (e) { /* localStorage unavailable */ }
    }

    function saveVisibility() {
        try { localStorage.setItem(LS_KEY, String(visible)); } catch (e) {}
    }

    function updateBadge() {
        var badge = document.getElementById('ghostCountBadge');
        if (badge) {
            var count = ghostPaths.length;
            badge.textContent = count || '';
            badge.dataset.count = count;
        }
    }

    function updateButtonState() {
        var btn = document.getElementById('btnGhostPaths');
        if (btn) btn.classList.toggle('active', visible);
    }

    function truncateLabel(label) {
        if (!label) return '';
        return label.length > LABEL_MAX_CHARS
            ? label.substring(0, LABEL_MAX_CHARS - 1) + '\u2026'
            : label;
    }

    // ── Dedup: keep only the latest ghost path per from->to pair ──
    function dedupPaths(paths) {
        var seen = {};
        var result = [];
        // Walk backwards so the last recorded wins
        for (var i = paths.length - 1; i >= 0; i--) {
            var key = paths[i].fromNodeId + '->' + paths[i].toNodeId;
            if (!seen[key]) {
                seen[key] = true;
                result.unshift(paths[i]);
            }
        }
        return result;
    }

    // ── Ghost Path Rendering ──

    function getNodeCenter(nodeId) {
        var el = DiagramDOM.findNodeElement(nodeId);
        if (!el || !el.getBBox) return null;
        var bbox = el.getBBox();

        // Custom renderer uses transform="translate(x,y)" on <g> nodes.
        var tx = 0, ty = 0;
        var transform = el.getAttribute('transform');
        if (transform) {
            var match = transform.match(/translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
            if (match) {
                tx = parseFloat(match[1]);
                ty = parseFloat(match[2]);
            }
        }

        return {
            x: tx + bbox.x + bbox.width / 2,
            y: ty + bbox.y + bbox.height / 2
        };
    }

    function getNodeBottom(nodeId) {
        var el = DiagramDOM.findNodeElement(nodeId);
        if (!el || !el.getBBox) return null;
        var bbox = el.getBBox();

        var tx = 0, ty = 0;
        var transform = el.getAttribute('transform');
        if (transform) {
            var match = transform.match(/translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
            if (match) {
                tx = parseFloat(match[1]);
                ty = parseFloat(match[2]);
            }
        }

        return {
            x: tx + bbox.x + bbox.width / 2,
            y: ty + bbox.y + bbox.height
        };
    }

    function getNodeTop(nodeId) {
        var el = DiagramDOM.findNodeElement(nodeId);
        if (!el || !el.getBBox) return null;
        var bbox = el.getBBox();

        var tx = 0, ty = 0;
        var transform = el.getAttribute('transform');
        if (transform) {
            var match = transform.match(/translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
            if (match) {
                tx = parseFloat(match[1]);
                ty = parseFloat(match[2]);
            }
        }

        return {
            x: tx + bbox.x + bbox.width / 2,
            y: ty + bbox.y
        };
    }

    /**
     * Build a cubic bezier that curves to the right of the straight line,
     * so it doesn't overlap existing edges.
     */
    function buildCurvedPath(from, to, index) {
        var dx = to.x - from.x;
        var dy = to.y - from.y;
        // Perpendicular offset direction (alternate sides for multiple ghosts)
        var side = (index % 2 === 0) ? 1 : -1;
        var offset = CURVE_OFFSET * side;

        // Midpoint
        var mx = (from.x + to.x) / 2;
        var my = (from.y + to.y) / 2;

        // Perpendicular vector (normalized)
        var len = Math.sqrt(dx * dx + dy * dy) || 1;
        var px = -dy / len * offset;
        var py = dx / len * offset;

        // Control point
        var cx = mx + px;
        var cy = my + py;

        return {
            d: 'M ' + from.x + ' ' + from.y +
               ' Q ' + cx + ' ' + cy +
               ' ' + to.x + ' ' + to.y,
            labelX: (from.x + 2 * cx + to.x) / 4,
            labelY: (from.y + 2 * cy + to.y) / 4
        };
    }

    function createArrowMarker(svg) {
        // Check if our ghost arrow marker already exists
        if (svg.querySelector('#ghost-arrow')) return;

        var defs = svg.querySelector('defs');
        if (!defs) {
            defs = document.createElementNS(SVG_NS, 'defs');
            svg.insertBefore(defs, svg.firstChild);
        }

        var marker = document.createElementNS(SVG_NS, 'marker');
        marker.setAttribute('id', 'ghost-arrow');
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '6');
        marker.setAttribute('markerHeight', '6');
        marker.setAttribute('orient', 'auto-start-reverse');

        var arrow = document.createElementNS(SVG_NS, 'path');
        arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        arrow.setAttribute('fill', GHOST_COLOR);
        marker.appendChild(arrow);
        defs.appendChild(marker);
    }

    function renderGhostPaths() {
        var svg = DiagramDOM.getSVG();
        if (!svg) return;

        // Remove existing ghost path elements
        svg.querySelectorAll('.ghost-path').forEach(function(el) { el.remove(); });

        if (!visible || ghostPaths.length === 0) return;

        createArrowMarker(svg);

        var unique = dedupPaths(ghostPaths);
        var diagramGroup = svg.querySelector('.smartb-diagram');
        var container = diagramGroup || svg;

        for (var i = 0; i < unique.length; i++) {
            var gp = unique[i];
            var fromPt = getNodeBottom(gp.fromNodeId) || getNodeCenter(gp.fromNodeId);
            var toPt = getNodeTop(gp.toNodeId) || getNodeCenter(gp.toNodeId);
            if (!fromPt || !toPt) continue;

            var g = document.createElementNS(SVG_NS, 'g');
            g.setAttribute('class', 'ghost-path');
            g.setAttribute('opacity', String(GHOST_OPACITY));

            // Curved path
            var curve = buildCurvedPath(fromPt, toPt, i);
            var pathEl = document.createElementNS(SVG_NS, 'path');
            pathEl.setAttribute('d', curve.d);
            pathEl.setAttribute('stroke-dasharray', GHOST_DASH);
            pathEl.setAttribute('stroke', GHOST_COLOR);
            pathEl.setAttribute('stroke-width', String(GHOST_STROKE_W));
            pathEl.setAttribute('fill', 'none');
            pathEl.setAttribute('marker-end', 'url(#ghost-arrow)');
            g.appendChild(pathEl);

            // Label with background pill
            if (gp.label) {
                var labelText = truncateLabel(gp.label);

                // Create text first to measure it
                var text = document.createElementNS(SVG_NS, 'text');
                text.setAttribute('x', String(curve.labelX));
                text.setAttribute('y', String(curve.labelY));
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('dominant-baseline', 'central');
                text.setAttribute('fill', GHOST_COLOR);
                text.setAttribute('font-size', String(LABEL_FONT_SIZE));
                text.setAttribute('font-family', "'JetBrains Mono', 'Inter', monospace");
                text.setAttribute('font-weight', '500');
                text.textContent = labelText;

                // Append text temporarily to measure
                g.appendChild(text);
                container.appendChild(g);
                var tBox = text.getBBox();
                container.removeChild(g);
                g.removeChild(text);

                // Background pill
                var bg = document.createElementNS(SVG_NS, 'rect');
                bg.setAttribute('x', String(tBox.x - LABEL_BG_PAD_X));
                bg.setAttribute('y', String(tBox.y - LABEL_BG_PAD_Y));
                bg.setAttribute('width', String(tBox.width + LABEL_BG_PAD_X * 2));
                bg.setAttribute('height', String(tBox.height + LABEL_BG_PAD_Y * 2));
                bg.setAttribute('rx', '4');
                bg.setAttribute('fill', LABEL_BG_COLOR);
                bg.setAttribute('opacity', String(LABEL_BG_OPACITY));
                g.appendChild(bg);
                g.appendChild(text);
            }

            container.appendChild(g);
        }
    }

    // ── Public API Methods ──

    function toggle() {
        visible = !visible;
        saveVisibility();
        updateButtonState();
        renderGhostPaths();
    }

    function isVisibleFn() {
        return visible;
    }

    function updateGhostPathsFn(paths) {
        ghostPaths = Array.isArray(paths) ? paths : [];
        updateBadge();
        if (visible) renderGhostPaths();
    }

    function getCount() {
        return ghostPaths.length;
    }

    // ── Init ──

    function init() {
        loadVisibility();
        updateButtonState();
        updateBadge();

        // Re-render ghost paths after each diagram render
        if (window.SmartBEventBus) {
            SmartBEventBus.on('diagram:rendered', renderGhostPaths);
        }

        renderGhostPaths();
    }

    // ── Public API ──
    window.SmartBGhostPaths = {
        init: init,
        toggle: toggle,
        isVisible: isVisibleFn,
        updateGhostPaths: updateGhostPathsFn,
        renderGhostPaths: renderGhostPaths,
        getCount: getCount,
    };
})();
