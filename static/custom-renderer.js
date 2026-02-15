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

    /**
     * Render a graph model into the preview container.
     * Runs dagre layout, builds SVG, inserts into DOM, applies pan-zoom.
     * @param {Object} graphModel - Graph model JSON (nodes, edges, subgraphs).
     */
    async function render(graphModel) {
        if (!graphModel || !graphModel.nodes) return;

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
        fetchAndRender: fetchAndRender
    };

})();
