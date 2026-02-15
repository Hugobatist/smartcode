/**
 * SmartB Dagre Layout -- graph layout computation using dagre.
 * Converts a GraphModel JSON (from /api/graph/:file) into positioned nodes,
 * edges with routed points, and subgraph bounding boxes.
 *
 * Dependencies: dagre (loaded via CDN in live.html)
 * Dependents: canvas-renderer.js (Plan 02)
 *
 * Usage:
 *   var result = SmartBDagreLayout.computeLayout(graphModel);
 *   // result => { width, height, nodes[], edges[], subgraphs[] }
 */
(function() {
    'use strict';

    // ── Text measurement (lazy canvas init) ──

    var _measureCanvas = null;

    function getMeasureContext() {
        if (!_measureCanvas) {
            _measureCanvas = document.createElement('canvas');
        }
        return _measureCanvas.getContext('2d');
    }

    /**
     * Measure the pixel width of a text string using an offscreen canvas.
     * @param {string} text - The text to measure.
     * @param {string} [font] - CSS font string. Defaults to '600 15px Inter, sans-serif'.
     * @returns {number} Width in pixels.
     */
    function measureTextWidth(text, font) {
        var ctx = getMeasureContext();
        ctx.font = font || '600 15px Inter, sans-serif';
        return ctx.measureText(text).width;
    }

    /**
     * Calculate node dimensions based on label text and shape type.
     * Returns { width, height } with shape-specific adjustments.
     * @param {string} label - Node label text.
     * @param {string} shape - Node shape (rect, circle, diamond, etc.).
     * @returns {{ width: number, height: number }}
     */
    function measureNodeDimensions(label, shape) {
        var textW = measureTextWidth(label);
        var hPad = 32;
        var lineH = 24;
        var vPad = 24;
        var w = textW + hPad;
        var h = lineH + vPad;

        switch (shape) {
            case 'circle':
                var diameter = Math.max(w, h) + 8;
                w = diameter;
                h = diameter;
                break;
            case 'diamond':
                w = w * 1.4;
                h = h * 1.4;
                break;
            case 'hexagon':
                w = w + h / 2;
                break;
            case 'cylinder':
                h = h + 16;
                break;
            default:
                break;
        }

        return { width: Math.ceil(w), height: Math.ceil(h) };
    }

    // ── Subgraph membership lookup ──

    /**
     * Build a Set of all subgraph IDs for quick lookup.
     * @param {Object} graphModel - The graph model from /api/graph/:file.
     * @returns {Set<string>}
     */
    function buildSubgraphIdSet(graphModel) {
        var ids = {};
        var entries = Object.keys(graphModel.subgraphs || {});
        for (var i = 0; i < entries.length; i++) {
            ids[entries[i]] = true;
        }
        return ids;
    }

    /**
     * Resolve a subgraph endpoint to its first child node (dagre bug #238 workaround).
     * When an edge references a subgraph ID, dagre cannot route it properly in
     * compound mode. We redirect the edge to the first node inside the subgraph.
     * @param {string} endpoint - Node or subgraph ID.
     * @param {Object} subgraphIds - Lookup of subgraph IDs.
     * @param {Object} subgraphs - The subgraphs map from graphModel.
     * @returns {string} The resolved node ID.
     */
    function resolveEndpoint(endpoint, subgraphIds, subgraphs) {
        if (subgraphIds[endpoint] && subgraphs[endpoint]) {
            var sg = subgraphs[endpoint];
            if (sg.nodeIds && sg.nodeIds.length > 0) {
                return sg.nodeIds[0];
            }
        }
        return endpoint;
    }

    // ── Layout computation ──

    /**
     * Compute a full layout for a GraphModel using dagre.
     * @param {Object} graphModel - The graph model JSON from /api/graph/:file.
     * @returns {{ width: number, height: number, nodes: Array, edges: Array, subgraphs: Array }}
     */
    function computeLayout(graphModel) {
        /* global dagre */
        var g = new dagre.graphlib.Graph({ compound: true });

        g.setGraph({
            rankdir: graphModel.direction || 'TB',
            nodesep: 60,
            ranksep: 80,
            edgesep: 10,
            marginx: 20,
            marginy: 20,
        });

        g.setDefaultEdgeLabel(function() { return {}; });

        // -- Add nodes --
        var nodeEntries = Object.entries(graphModel.nodes || {});
        for (var ni = 0; ni < nodeEntries.length; ni++) {
            var nodeId = nodeEntries[ni][0];
            var node = nodeEntries[ni][1];
            var dims = measureNodeDimensions(node.label || nodeId, node.shape || 'rect');
            g.setNode(nodeId, {
                label: node.label || nodeId,
                width: dims.width,
                height: dims.height,
                shape: node.shape || 'rect',
            });
        }

        // -- Add subgraphs --
        var sgEntries = Object.entries(graphModel.subgraphs || {});
        var subgraphIds = buildSubgraphIdSet(graphModel);

        for (var si = 0; si < sgEntries.length; si++) {
            var sgId = sgEntries[si][0];
            var sg = sgEntries[si][1];
            g.setNode(sgId, {
                label: sg.label || sgId,
                clusterLabelPos: 'top',
                style: 'subgraph',
            });

            // Parent child nodes inside this subgraph
            var sgNodeIds = sg.nodeIds || [];
            for (var sni = 0; sni < sgNodeIds.length; sni++) {
                g.setParent(sgNodeIds[sni], sgId);
            }

            // Nested subgraphs
            if (sg.parentId) {
                g.setParent(sgId, sg.parentId);
            }
        }

        // -- Add edges --
        var edges = graphModel.edges || [];
        var subgraphs = graphModel.subgraphs || {};

        for (var ei = 0; ei < edges.length; ei++) {
            var edge = edges[ei];
            var from = resolveEndpoint(edge.from, subgraphIds, subgraphs);
            var to = resolveEndpoint(edge.to, subgraphIds, subgraphs);

            var edgeLabel = edge.label || '';
            var edgeLabelW = edgeLabel ? measureTextWidth(edgeLabel) + 16 : 0;
            var edgeLabelH = edgeLabel ? 20 : 0;

            g.setEdge(from, to, {
                label: edgeLabel,
                width: edgeLabelW,
                height: edgeLabelH,
                labelpos: 'c',
            });
        }

        // -- Run dagre layout --
        dagre.layout(g);

        // -- Extract results --
        return extractLayoutResult(g, graphModel);
    }

    /**
     * Extract positioned layout data from a dagre graph after layout().
     * @param {Object} g - The dagre graph after layout.
     * @param {Object} graphModel - The original graph model (for metadata).
     * @returns {{ width: number, height: number, nodes: Array, edges: Array, subgraphs: Array }}
     */
    function extractLayoutResult(g, graphModel) {
        var graphInfo = g.graph();
        var subgraphIds = buildSubgraphIdSet(graphModel);

        var layoutNodes = [];
        var layoutSubgraphs = [];

        var allNodeIds = g.nodes();
        for (var i = 0; i < allNodeIds.length; i++) {
            var nid = allNodeIds[i];
            var ndata = g.node(nid);
            if (!ndata) continue;

            if (subgraphIds[nid]) {
                layoutSubgraphs.push({
                    id: nid,
                    label: ndata.label || nid,
                    x: ndata.x,
                    y: ndata.y,
                    width: ndata.width,
                    height: ndata.height,
                });
            } else {
                layoutNodes.push({
                    id: nid,
                    label: ndata.label || nid,
                    shape: ndata.shape || 'rect',
                    x: ndata.x,
                    y: ndata.y,
                    width: ndata.width,
                    height: ndata.height,
                });
            }
        }

        var layoutEdges = [];
        var dagreEdges = g.edges();
        for (var j = 0; j < dagreEdges.length; j++) {
            var de = dagreEdges[j];
            var edata = g.edge(de);
            if (!edata) continue;

            // Find the original edge data for type/id
            var origEdges = graphModel.edges || [];
            var origEdge = null;
            for (var k = 0; k < origEdges.length; k++) {
                if (origEdges[k].from === de.v && origEdges[k].to === de.w) {
                    origEdge = origEdges[k];
                    break;
                }
            }

            layoutEdges.push({
                id: origEdge ? origEdge.id : (de.v + '->' + de.w),
                from: de.v,
                to: de.w,
                label: edata.label || '',
                type: origEdge ? origEdge.type : 'arrow',
                points: edata.points || [],
            });
        }

        return {
            width: graphInfo.width || 0,
            height: graphInfo.height || 0,
            nodes: layoutNodes,
            edges: layoutEdges,
            subgraphs: layoutSubgraphs,
        };
    }

    // ── Public API ──
    window.SmartBDagreLayout = {
        computeLayout: computeLayout,
    };

})();
