/**
 * SmartB Selection -- node/edge selection, visual SVG indicators, keyboard shortcuts.
 * Manages the selection lifecycle: select, deselect, re-apply after re-render.
 *
 * Dependencies:
 *   - interaction-state.js (SmartBInteraction)
 *   - diagram-dom.js (DiagramDOM)
 *   - event-bus.js (SmartBEventBus)
 *   - diagram-editor.js (MmdEditor)
 *
 * Usage:
 *   SmartBSelection.init();
 *   SmartBSelection.selectNode('A');
 *   SmartBSelection.deselectAll();
 *   SmartBSelection.getSelected(); // { id: 'A', type: 'node' } or null
 */
(function() {
    'use strict';

    var SVG_NS = 'http://www.w3.org/2000/svg';

    // ── Internal State ──
    var selectedNodeId = null;
    var selectedType = null; // 'node' | 'edge'
    var overlayGroup = null; // SVGGElement for selection indicator

    // ── Style Injection ──
    var styleEl = document.createElement('style');
    styleEl.textContent = [
        '.selected-edge path { stroke: #6366f1 !important; stroke-width: 3 !important; }',
        '.selected-edge .smartb-edge-path { stroke: #6366f1 !important; stroke-width: 3 !important; }',
        '.selection-indicator { pointer-events: none; }',
    ].join('\n');
    document.head.appendChild(styleEl);

    // ── Core Functions ──

    /**
     * Clear existing selection indicator from SVG.
     */
    function clearIndicator() {
        if (overlayGroup && overlayGroup.parentNode) {
            overlayGroup.parentNode.removeChild(overlayGroup);
        }
        overlayGroup = null;
        // Remove any .selected-edge classes
        var svg = DiagramDOM.getSVG();
        if (svg) {
            var selectedEdges = svg.querySelectorAll('.selected-edge');
            for (var i = 0; i < selectedEdges.length; i++) {
                selectedEdges[i].classList.remove('selected-edge');
            }
        }
    }

    /**
     * Select a node by ID. Creates blue dashed border + 4 corner handles.
     * @param {string} nodeId
     */
    /**
     * Get the absolute position of an SVG element by walking its CTM.
     * Returns { x, y, width, height } in SVG root coordinates.
     */
    function getAbsoluteBBox(el, svg) {
        var bbox = el.getBBox();
        // Use getCTM to transform local bbox to SVG root coordinates
        var ctm = el.getCTM();
        var svgCtm = svg.getCTM();
        if (ctm && svgCtm) {
            var transform = svgCtm.inverse().multiply(ctm);
            return {
                x: transform.a * bbox.x + transform.e,
                y: transform.d * bbox.y + transform.f,
                width: bbox.width * transform.a,
                height: bbox.height * transform.d
            };
        }
        return bbox;
    }

    function selectNode(nodeId) {
        clearIndicator();

        var el = DiagramDOM.findNodeElement(nodeId);
        if (!el) return;

        var svg = DiagramDOM.getSVG();
        if (!svg) return;

        var bbox = getAbsoluteBBox(el, svg);

        // Create selection indicator group
        var g = document.createElementNS(SVG_NS, 'g');
        g.setAttribute('class', 'selection-indicator');

        // Blue dashed border rect
        var rect = document.createElementNS(SVG_NS, 'rect');
        rect.setAttribute('x', bbox.x - 4);
        rect.setAttribute('y', bbox.y - 4);
        rect.setAttribute('width', bbox.width + 8);
        rect.setAttribute('height', bbox.height + 8);
        rect.setAttribute('fill', 'none');
        rect.setAttribute('stroke', '#6366f1');
        rect.setAttribute('stroke-width', '2');
        rect.setAttribute('stroke-dasharray', '6,3');
        rect.setAttribute('rx', '4');
        g.appendChild(rect);

        // Four corner handles (8x8 px)
        var corners = [
            [bbox.x - 8, bbox.y - 8],
            [bbox.x + bbox.width, bbox.y - 8],
            [bbox.x - 8, bbox.y + bbox.height],
            [bbox.x + bbox.width, bbox.y + bbox.height],
        ];
        for (var i = 0; i < corners.length; i++) {
            var handle = document.createElementNS(SVG_NS, 'rect');
            handle.setAttribute('x', corners[i][0]);
            handle.setAttribute('y', corners[i][1]);
            handle.setAttribute('width', '8');
            handle.setAttribute('height', '8');
            handle.setAttribute('fill', '#6366f1');
            handle.setAttribute('rx', '2');
            g.appendChild(handle);
        }

        svg.appendChild(g);
        overlayGroup = g;

        // Update state
        selectedNodeId = nodeId;
        selectedType = 'node';
        if (window.SmartBInteraction) {
            SmartBInteraction.select(nodeId, 'node');
        }

        // Emit event
        if (window.SmartBEventBus) {
            SmartBEventBus.emit('selection:changed', { id: nodeId, type: 'node' });
        }
    }

    /**
     * Select an edge by ID. Adds .selected-edge CSS class (no handles).
     * @param {string} edgeId
     */
    function selectEdge(edgeId) {
        clearIndicator();

        var el = DiagramDOM.findEdgeElement(edgeId);
        if (!el) return;

        el.classList.add('selected-edge');

        // Update state
        selectedNodeId = edgeId;
        selectedType = 'edge';
        if (window.SmartBInteraction) {
            SmartBInteraction.select(edgeId, 'edge');
        }

        // Emit event
        if (window.SmartBEventBus) {
            SmartBEventBus.emit('selection:changed', { id: edgeId, type: 'edge' });
        }
    }

    /**
     * Deselect all. Removes indicators, clears state.
     */
    function deselectAll() {
        clearIndicator();
        selectedNodeId = null;
        selectedType = null;
        if (window.SmartBInteraction) {
            SmartBInteraction.clearSelection();
        }
        if (window.SmartBEventBus) {
            SmartBEventBus.emit('selection:changed', null);
        }
    }

    /**
     * Re-apply selection after SVG re-render (called on diagram:rendered).
     * If the selected element still exists, re-create the indicator.
     * If it was removed, deselect and transition FSM to idle.
     */
    function reapplySelection() {
        if (!selectedNodeId) return;

        if (selectedType === 'node') {
            var nodeEl = DiagramDOM.findNodeElement(selectedNodeId);
            if (nodeEl) {
                // Re-create indicator on new SVG
                var savedId = selectedNodeId;
                clearIndicator();
                selectedNodeId = savedId;
                selectedType = 'node';
                selectNode(savedId);
            } else {
                deselectAll();
                if (window.SmartBInteraction && SmartBInteraction.getState() === 'selected') {
                    SmartBInteraction.forceState('idle');
                }
            }
        } else if (selectedType === 'edge') {
            var edgeEl = DiagramDOM.findEdgeElement(selectedNodeId);
            if (edgeEl) {
                var savedEdgeId = selectedNodeId;
                clearIndicator();
                selectedNodeId = savedEdgeId;
                selectedType = 'edge';
                selectEdge(savedEdgeId);
            } else {
                deselectAll();
                if (window.SmartBInteraction && SmartBInteraction.getState() === 'selected') {
                    SmartBInteraction.forceState('idle');
                }
            }
        }
    }

    // ── Click Handler (delegated on #preview-container) ──

    function handleClick(e) {
        // Check FSM blocking states
        if (window.SmartBInteraction && SmartBInteraction.isBlocking()) return;

        // Don't handle in modes that have their own click handlers
        var fsmState = window.SmartBInteraction ? SmartBInteraction.getState() : 'idle';
        if (fsmState === 'flagging' || fsmState === 'add-node' || fsmState === 'add-edge') return;

        // Skip UI controls and overlays
        if (e.target.closest('.zoom-controls') ||
            e.target.closest('.flag-popover') ||
            e.target.closest('.editor-popover') ||
            e.target.closest('.context-menu') ||
            e.target.closest('.inline-edit-overlay')) return;

        // Detect what was clicked
        var nodeInfo = DiagramDOM.extractNodeId(e.target);

        if (nodeInfo && nodeInfo.type === 'node') {
            selectNode(nodeInfo.id);
            if (window.SmartBInteraction) SmartBInteraction.transition('click_node', nodeInfo);
        } else if (nodeInfo && nodeInfo.type === 'edge') {
            selectEdge(nodeInfo.id);
            if (window.SmartBInteraction) SmartBInteraction.transition('click_edge', nodeInfo);
        } else if (nodeInfo && nodeInfo.type === 'subgraph') {
            // Treat subgraph like a node for selection
            selectNode(nodeInfo.id);
            if (window.SmartBInteraction) SmartBInteraction.transition('click_node', nodeInfo);
        } else {
            // Empty space click
            if (selectedNodeId) {
                deselectAll();
                if (window.SmartBInteraction) SmartBInteraction.transition('click_empty');
            }
        }
    }

    // ── Keyboard Handler (document-level) ──

    function handleKeydown(e) {
        // Don't handle if focus is on text inputs
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' ||
            e.target.getAttribute('contenteditable')) return;

        var fsmState = window.SmartBInteraction ? SmartBInteraction.getState() : 'idle';

        if (fsmState === 'selected' && selectedNodeId) {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                if (selectedType === 'node' && window.MmdEditor) {
                    var nodeToRemove = selectedNodeId;
                    deselectAll();
                    MmdEditor.doRemoveNode(nodeToRemove);
                }
                if (window.SmartBInteraction) SmartBInteraction.transition('delete_node');
            }
            if (e.key === 'Escape') {
                deselectAll();
                if (window.SmartBInteraction) SmartBInteraction.transition('escape');
            }
        }
    }

    // ── Init ──

    function init() {
        var container = document.getElementById('preview-container');
        if (container) {
            container.addEventListener('click', handleClick);
        }

        document.addEventListener('keydown', handleKeydown);

        // Re-apply selection after SVG re-render
        if (window.SmartBEventBus) {
            SmartBEventBus.on('diagram:rendered', reapplySelection);
        }
    }

    /**
     * Returns the current selection.
     * @returns {{ id: string, type: string }|null}
     */
    function getSelected() {
        if (!selectedNodeId) return null;
        return { id: selectedNodeId, type: selectedType };
    }

    // ── Public API ──
    window.SmartBSelection = {
        init: init,
        selectNode: selectNode,
        selectEdge: selectEdge,
        deselectAll: deselectAll,
        reapplySelection: reapplySelection,
        getSelected: getSelected,
    };
})();
