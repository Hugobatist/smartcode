/**
 * SmartCode Custom Renderer -- orchestrates the custom SVG rendering pipeline.
 * Fetches graph data from /api/graph/, runs dagre layout, builds SVG,
 * and inserts into the preview container.
 *
 * Dependencies: dagre-layout.js (SmartCodeDagreLayout), svg-renderer.js (SmartCodeSvgRenderer),
 *               renderer.js (SmartCodeRenderer), event-bus.js (SmartCodeEventBus),
 *               pan-zoom.js (applyTransform, zoomFit)
 * Dependents: app-init.js (called via renderWithType)
 *
 * Usage:
 *   SmartCodeCustomRenderer.render(graphModel);
 *   SmartCodeCustomRenderer.fetchAndRender(filePath);
 */
(function() {
    'use strict';

    // ── Leitor de token CSS (fonte única de verdade em tokens.css, D-26) ──
    function readToken(name, fallback) {
        try {
            var v = getComputedStyle(document.documentElement)
                .getPropertyValue(name).trim();
            return v || fallback;
        } catch (e) {
            return fallback;
        }
    }

    // ── Paleta de status — lida de tokens.css (não mais hardcoded).
    // No modelo pastel, o texto usa o grafite/giz (--node-text), não branco,
    // porque os fills são claros. Fallbacks espelham a paleta de marcador. ──
    function getStatusColors(status) {
        var text = readToken('--node-text', '#2b2a28');
        switch (status) {
            case 'ok':
                return { fill: readToken('--status-ok', '#e6f6ec'),
                         stroke: readToken('--status-ok-ink', '#2f8f57'), text: text };
            case 'problem':
                return { fill: readToken('--status-problem', '#fdeaea'),
                         stroke: readToken('--status-problem-ink', '#cc4b4b'), text: text };
            case 'in-progress':
                return { fill: readToken('--status-warning', '#fdf3da'),
                         stroke: readToken('--status-warning-ink', '#b8860b'), text: text };
            case 'discarded':
                return { fill: readToken('--status-neutral', '#f0efec'),
                         stroke: readToken('--status-neutral-ink', '#8a857c'), text: text };
            default:
                return null;
        }
    }

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
            var colors = getStatusColors(status);
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

        // Compute layout via dagre — throws if NaN detected
        var layout = SmartCodeDagreLayout.computeLayout(graphModel);

        // Build SVG DOM
        var svg = SmartCodeSvgRenderer.createSVG(layout);

        // Insert into preview, clearing previous content
        var preview = document.getElementById('preview');
        preview.textContent = '';
        preview.appendChild(svg);

        // Apply inline styles from .mmd source (fill, stroke, etc.)
        applyNodeStyles(graphModel);

        // Apply current pan-zoom transform
        if (window.applyTransform) window.applyTransform();

        // Auto-fit on initial render
        if (window.SmartCodeRenderer && SmartCodeRenderer.getInitialRender()) {
            requestAnimationFrame(function() {
                if (window.zoomFit) window.zoomFit();
            });
            SmartCodeRenderer.setInitialRender(false);
        } else {
            if (window.applyTransform) window.applyTransform();
        }

        // Apply flag indicators after SVG is in the DOM
        if (window.SmartCodeAnnotations) SmartCodeAnnotations.applyFlagsToSVG();

        // Apply status colors from graph model (overrides nodeStyles for flagged nodes)
        applyStatusColors(graphModel);

        // Re-apply heatmap risk overlay if active (heatmap overrides status colors)
        if (window.SmartCodeHeatmap && SmartCodeHeatmap.isActive()) {
            SmartCodeHeatmap.applyRiskOverlay();
        }

        // Apply collapse overlays if available
        if (window.SmartCodeCollapseUI && SmartCodeCollapseUI.applyOverlays) {
            SmartCodeCollapseUI.applyOverlays();
        }

        // Emit rendered event
        if (window.SmartCodeEventBus) {
            SmartCodeEventBus.emit('diagram:rendered', {
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

        var resp = await fetch((window.SmartCodeBaseUrl || '') + '/api/graph/' + encodeURIComponent(filePath));
        if (!resp.ok) {
            throw new Error('Failed to fetch graph model: ' + resp.status + ' ' + resp.statusText);
        }

        var graphModel = await resp.json();
        await render(graphModel);
    }

    // ── Public API ──
    window.SmartCodeCustomRenderer = {
        render: render,
        fetchAndRender: fetchAndRender,
        getLastGraphModel: function() { return lastGraphModel; },
    };

})();
