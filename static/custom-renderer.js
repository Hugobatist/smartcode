/**
 * SmartB Custom Renderer -- orchestrates the custom SVG rendering pipeline.
 * Fetches graph data from /api/graph/, runs dagre layout, builds SVG,
 * and inserts into the preview container.
 *
 * Dependencies: dagre-layout.js (SmartBDagreLayout), svg-renderer.js (SmartBSvgRenderer),
 *               renderer.js (SmartBRenderer), event-bus.js (SmartBEventBus),
 *               pan-zoom.js (applyTransform, zoomFit)
 * Dependents: app-init.js (called via renderWithType)
 *
 * Usage:
 *   SmartBCustomRenderer.render(graphModel);
 *   SmartBCustomRenderer.fetchAndRender(filePath);
 */
(function() {
    'use strict';

    // ── Status color palette (matches Mermaid classDef in renderer.js) ──
    var STATUS_COLORS = {
        'ok':          { fill: '#22c55e', stroke: '#16a34a', text: '#fff' },
        'problem':     { fill: '#ef4444', stroke: '#dc2626', text: '#fff' },
        'in-progress': { fill: '#eab308', stroke: '#ca8a04', text: '#000' },
        'discarded':   { fill: '#9ca3af', stroke: '#6b7280', text: '#fff' },
    };

    // ── Last rendered graph model (for re-application) ──
    var lastGraphModel = null;

    /**
     * Apply status colors to SVG nodes based on the graph model's statuses map.
     * @param {Object} graphModel - Graph model containing a .statuses map.
     */
    function applyStatusColors(graphModel) {
        if (!graphModel || !graphModel.statuses) return;
        var svg = document.querySelector('#preview svg');
        if (!svg) return;
        var statuses = graphModel.statuses;
        for (var nodeId in statuses) {
            if (!statuses.hasOwnProperty(nodeId)) continue;
            var status = statuses[nodeId];
            var colors = STATUS_COLORS[status];
            if (!colors) continue;
            var nodeEl = svg.querySelector('[data-node-id="' + nodeId + '"]');
            if (!nodeEl) continue;
            // Find shape element (rect, circle, polygon, etc.)
            var shape = nodeEl.querySelector('rect, circle, polygon, path, ellipse');
            if (!shape) {
                var childG = nodeEl.querySelector('g');
                if (childG) shape = childG.querySelector('rect, circle, polygon, path, ellipse');
            }
            if (shape) {
                shape.setAttribute('fill', colors.fill);
                shape.setAttribute('stroke', colors.stroke);
            }
            var textEl = nodeEl.querySelector('text');
            if (textEl) textEl.setAttribute('fill', colors.text);
        }
    }

    /**
     * Parse a Mermaid-style inline style string into a key-value map.
     * E.g. "fill:#e3f2fd,stroke:#1565c0" → { fill: '#e3f2fd', stroke: '#1565c0' }
     */
    function parseStyleString(styleStr) {
        var result = {};
        if (!styleStr) return result;
        var parts = styleStr.split(',');
        for (var i = 0; i < parts.length; i++) {
            var kv = parts[i].split(':');
            if (kv.length >= 2) {
                result[kv[0].trim()] = kv.slice(1).join(':').trim();
            }
        }
        return result;
    }

    /**
     * Apply nodeStyles from the graph model to matching SVG elements.
     * Targets both nodes (data-node-id) and subgraphs (data-subgraph-id).
     */
    function applyNodeStyles(graphModel) {
        if (!graphModel || !graphModel.nodeStyles) return;
        var svg = document.querySelector('#preview svg');
        if (!svg) return;
        var styles = graphModel.nodeStyles;
        for (var targetId in styles) {
            if (!styles.hasOwnProperty(targetId)) continue;
            var parsed = parseStyleString(styles[targetId]);
            // Try subgraph first (more common for style directives)
            var el = svg.querySelector('[data-subgraph-id="' + targetId + '"]')
                  || svg.querySelector('[data-node-id="' + targetId + '"]');
            if (!el) continue;
            var shape = el.querySelector('rect, circle, polygon, path, ellipse');
            if (!shape) {
                var childG = el.querySelector('g');
                if (childG) shape = childG.querySelector('rect, circle, polygon, path, ellipse');
            }
            if (shape) {
                if (parsed.fill) shape.setAttribute('fill', parsed.fill);
                if (parsed.stroke) shape.setAttribute('stroke', parsed.stroke);
                if (parsed['stroke-width']) shape.setAttribute('stroke-width', parsed['stroke-width']);
                if (parsed['stroke-dasharray']) shape.setAttribute('stroke-dasharray', parsed['stroke-dasharray']);
            }
            // Apply text color if specified
            if (parsed.color) {
                var textEl = el.querySelector('text');
                if (textEl) textEl.setAttribute('fill', parsed.color);
            }
        }
    }

    /**
     * Render a graph model into the preview container.
     * Runs dagre layout, builds SVG, inserts into DOM, applies pan-zoom.
     * @param {Object} graphModel - Graph model JSON (nodes, edges, subgraphs).
     */
    async function render(graphModel) {
        if (!graphModel || !graphModel.nodes) return;

        // Store for re-application
        lastGraphModel = graphModel;

        // Wait for fonts so text measurement is accurate
        await document.fonts.ready;

        // Compute layout via dagre
        var layout = SmartBDagreLayout.computeLayout(graphModel);

        // Build SVG DOM
        var svg = SmartBSvgRenderer.createSVG(layout);

        // Insert into preview, clearing previous content
        var preview = document.getElementById('preview');
        preview.textContent = '';
        preview.appendChild(svg);

        // Apply inline styles from .mmd source (fill, stroke, etc.)
        applyNodeStyles(graphModel);

        // Apply current pan-zoom transform
        if (window.applyTransform) window.applyTransform();

        // Auto-fit on initial render
        if (window.SmartBRenderer && SmartBRenderer.getInitialRender()) {
            requestAnimationFrame(function() {
                if (window.zoomFit) window.zoomFit();
            });
            SmartBRenderer.setInitialRender(false);
        } else {
            if (window.applyTransform) window.applyTransform();
        }

        // Apply flag indicators after SVG is in the DOM
        if (window.SmartBAnnotations) SmartBAnnotations.applyFlagsToSVG();

        // Apply status colors from graph model (overrides nodeStyles for flagged nodes)
        applyStatusColors(graphModel);

        // Apply collapse overlays if available
        if (window.SmartBCollapseUI && SmartBCollapseUI.applyOverlays) {
            SmartBCollapseUI.applyOverlays();
        }

        // Emit rendered event
        if (window.SmartBEventBus) {
            SmartBEventBus.emit('diagram:rendered', {
                svg: svg.outerHTML,
                renderer: 'custom'
            });
        }
    }

    /**
     * Fetch graph model from /api/graph/ endpoint and render it.
     * @param {string} filePath - The diagram file path to fetch.
     */
    async function fetchAndRender(filePath) {
        if (!filePath) return;

        var resp = await fetch('/api/graph/' + encodeURIComponent(filePath));
        if (!resp.ok) {
            throw new Error('Failed to fetch graph model: ' + resp.status + ' ' + resp.statusText);
        }

        var graphModel = await resp.json();
        await render(graphModel);
    }

    // ── Public API ──
    window.SmartBCustomRenderer = {
        render: render,
        fetchAndRender: fetchAndRender,
        getLastGraphModel: function() { return lastGraphModel; },
    };

})();
