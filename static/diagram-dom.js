/**
 * DiagramDOM — abstraction layer for SVG DOM queries.
 * Supports both Mermaid-rendered SVGs and custom SmartB SVGs.
 * Consolidates SVG element lookups duplicated across annotations.js,
 * collapse-ui.js, search.js, and diagram-editor.js.
 *
 * IMPORTANT: Never cache SVG element references — render()
 * replaces the entire SVG via innerHTML, invalidating all references.
 *
 * Usage:
 *   DiagramDOM.getSVG();
 *   DiagramDOM.getRendererType();  // 'custom' | 'mermaid'
 *   DiagramDOM.findNodeElement('myNode');
 *   DiagramDOM.extractNodeId(clickedElement);
 */
(function() {
    'use strict';

    var NODE_RE = /^flowchart-(.+)-\d+$/;
    var SUBGRAPH_RE = /^subGraph\d+-(.+)-\d+$/;
    var EDGE_RE = /^L-(.+)$/;

    var DiagramDOM = {
        /**
         * Returns the current SVG element, or null.
         */
        getSVG: function() {
            return document.querySelector('#preview svg');
        },

        /**
         * Detects whether the current SVG is from the custom renderer.
         * Checks for the `.smartb-diagram` class on the root <g> element.
         * @returns {'custom'|'mermaid'}
         */
        getRendererType: function() {
            var svg = this.getSVG();
            if (!svg) return 'mermaid';
            return svg.querySelector('.smartb-diagram') ? 'custom' : 'mermaid';
        },

        /**
         * Finds the SVG element for a given node ID.
         * Tries data-node-id attribute first (custom), then Mermaid regex.
         */
        findNodeElement: function(nodeId) {
            var svg = this.getSVG();
            if (!svg) return null;
            // Custom renderer: data-node-id attribute
            var custom = svg.querySelector('[data-node-id="' + nodeId + '"]');
            if (custom) return custom;
            // Mermaid: regex on element id attributes
            var elements = svg.querySelectorAll('[id]');
            for (var i = 0; i < elements.length; i++) {
                var el = elements[i];
                var id = el.getAttribute('id');
                var match = id ? id.match(NODE_RE) : null;
                if (match && match[1] === nodeId) return el;
            }
            return null;
        },

        /**
         * Finds the SVG element for a given subgraph ID.
         * Matches /^subGraph\d+-(.+)-\d+$/.
         */
        findSubgraphElement: function(subgraphId) {
            var svg = this.getSVG();
            if (!svg) return null;
            // Custom renderer: data-subgraph-id attribute
            var custom = svg.querySelector('[data-subgraph-id="' + subgraphId + '"]');
            if (custom) return custom;
            // Mermaid: regex on element id attributes
            var elements = svg.querySelectorAll('[id]');
            for (var i = 0; i < elements.length; i++) {
                var el = elements[i];
                var id = el.getAttribute('id');
                var match = id ? id.match(SUBGRAPH_RE) : null;
                if (match && match[1] === subgraphId) return el;
            }
            return null;
        },

        /**
         * Walks up the DOM from an element to find node/edge/subgraph identity.
         * Consolidates duplicated logic from annotations.js, collapse-ui.js,
         * search.js, and diagram-editor.js.
         *
         * Returns: { type: 'node'|'edge'|'subgraph', id: string } or null.
         */
        extractNodeId: function(element) {
            var el = element;
            while (el && el !== document.body) {
                // Custom renderer: check data attributes first
                if (el.getAttribute) {
                    var dataNodeId = el.getAttribute('data-node-id');
                    if (dataNodeId) return { type: 'node', id: dataNodeId };
                    var dataEdgeId = el.getAttribute('data-edge-id');
                    if (dataEdgeId) return { type: 'edge', id: dataEdgeId };
                    var dataSubgraphId = el.getAttribute('data-subgraph-id');
                    if (dataSubgraphId) return { type: 'subgraph', id: dataSubgraphId };
                }
                // Mermaid: regex patterns on id attribute
                var id = el.getAttribute ? el.getAttribute('id') : null;
                if (id) {
                    var nodeMatch = id.match(NODE_RE);
                    if (nodeMatch) return { type: 'node', id: nodeMatch[1] };
                    var edgeMatch = id.match(EDGE_RE);
                    if (edgeMatch) return { type: 'edge', id: 'L-' + edgeMatch[1] };
                    var subMatch = id.match(SUBGRAPH_RE);
                    if (subMatch) return { type: 'subgraph', id: subMatch[1] };
                }
                el = el.parentElement;
            }
            return null;
        },

        /**
         * Returns getBBox() of the found node element, or null.
         */
        getNodeBBox: function(nodeId) {
            var el = this.findNodeElement(nodeId);
            if (!el || !el.getBBox) return null;
            return el.getBBox();
        },

        /**
         * Returns the .nodeLabel textContent within a node, or null.
         */
        getNodeLabel: function(nodeId) {
            var el = this.findNodeElement(nodeId);
            if (!el) return null;
            // Custom renderer: direct child <text> element
            if (el.getAttribute('data-node-id')) {
                var textEl = el.querySelector('text');
                return textEl ? textEl.textContent : null;
            }
            // Mermaid: .nodeLabel span
            var label = el.querySelector('.nodeLabel');
            return label ? label.textContent : null;
        },

        /**
         * Returns all .nodeLabel elements from the SVG.
         */
        getAllNodeLabels: function() {
            var svg = this.getSVG();
            if (!svg) return [];
            return Array.from(svg.querySelectorAll('.nodeLabel'));
        },

        /**
         * Walks up to find .node or .cluster parent element.
         */
        findMatchParent: function(element) {
            var current = element;
            while (current && current.tagName !== 'svg') {
                if (current.classList &&
                    (current.classList.contains('node') ||
                     current.classList.contains('cluster') ||
                     current.classList.contains('smartb-node') ||
                     current.classList.contains('smartb-subgraph'))) {
                    return current;
                }
                current = current.parentElement;
            }
            return null;
        },

        /**
         * Adds/removes outline styling on a node.
         */
        highlightNode: function(nodeId, on) {
            var el = this.findNodeElement(nodeId);
            if (!el) return;
            el.style.outline = on ? '3px solid #6366f1' : '';
            el.style.outlineOffset = on ? '4px' : '';
        },

        /**
         * Returns SVG viewBox baseVal, or null.
         */
        getViewBox: function() {
            var svg = this.getSVG();
            if (!svg) return null;
            return (svg.viewBox && svg.viewBox.baseVal) ? svg.viewBox.baseVal : null;
        }
    };

    window.DiagramDOM = DiagramDOM;
})();
