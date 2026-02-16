/**
 * SmartB Ghost Paths -- renders ghost (potential/alternative) edges as
 * dashed translucent lines on the diagram SVG. Toggle visibility via button.
 *
 * Dependencies:
 *   - diagram-dom.js (DiagramDOM)
 *   - event-bus.js (SmartBEventBus)
 *
 * Usage:
 *   SmartBGhostPaths.init();
 *   SmartBGhostPaths.updateGhostPaths(pathsArray);
 *   SmartBGhostPaths.toggle();
 *   SmartBGhostPaths.isVisible();
 *   SmartBGhostPaths.getCount();
 */
(function() {
    'use strict';

    var SVG_NS = 'http://www.w3.org/2000/svg';
    var LS_KEY = 'smartb-ghost-paths-visible';

    // ── Module State ──
    var ghostPaths = []; // array of { fromNodeId, toNodeId, label }
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

    // ── Ghost Path Rendering ──

    function getNodeCenter(nodeId) {
        var el = DiagramDOM.findNodeElement(nodeId);
        if (!el || !el.getBBox) return null;
        var bbox = el.getBBox();
        return { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 };
    }

    function renderGhostPaths() {
        var svg = DiagramDOM.getSVG();
        if (!svg) return;

        // Remove existing ghost path elements
        svg.querySelectorAll('.ghost-path').forEach(function(el) { el.remove(); });

        if (!visible || ghostPaths.length === 0) return;

        // Find insertion point: before first real edge or append
        var diagramGroup = svg.querySelector('.smartb-diagram');
        var container = diagramGroup || svg;
        var firstEdge = container.querySelector('.smartb-edge');

        for (var i = 0; i < ghostPaths.length; i++) {
            var gp = ghostPaths[i];
            var fromCenter = getNodeCenter(gp.fromNodeId);
            var toCenter = getNodeCenter(gp.toNodeId);
            if (!fromCenter || !toCenter) continue;

            var g = document.createElementNS(SVG_NS, 'g');
            g.setAttribute('class', 'ghost-path');
            g.setAttribute('opacity', '0.3');

            var path = document.createElementNS(SVG_NS, 'path');
            path.setAttribute('d', 'M ' + fromCenter.x + ' ' + fromCenter.y +
                ' L ' + toCenter.x + ' ' + toCenter.y);
            path.setAttribute('stroke-dasharray', '8,4');
            path.setAttribute('stroke', '#9ca3af');
            path.setAttribute('stroke-width', '1.5');
            path.setAttribute('fill', 'none');
            path.setAttribute('marker-end', 'url(#arrow-normal)');
            g.appendChild(path);

            // Optional label at midpoint
            if (gp.label) {
                var mx = (fromCenter.x + toCenter.x) / 2;
                var my = (fromCenter.y + toCenter.y) / 2;
                var text = document.createElementNS(SVG_NS, 'text');
                text.setAttribute('x', mx);
                text.setAttribute('y', my - 6);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('fill', '#9ca3af');
                text.setAttribute('font-size', '11');
                text.setAttribute('font-family', "'Inter', sans-serif");
                text.textContent = gp.label;
                g.appendChild(text);
            }

            if (firstEdge) {
                container.insertBefore(g, firstEdge);
            } else {
                container.appendChild(g);
            }
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

        // Render initial ghost paths if any exist and visible
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
