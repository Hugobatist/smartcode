/**
 * SmartB Pan/Zoom -- viewport transformation, scroll zoom, drag pan.
 * Extracted from live.html (Phase 9 Plan 02).
 *
 * Dependencies: interaction-state.js (SmartBInteraction, optional)
 * Dependents: renderer.js (calls zoomFit/applyTransform via window globals)
 *
 * Usage:
 *   SmartBPanZoom.zoomIn();
 *   SmartBPanZoom.zoomOut();
 *   SmartBPanZoom.zoomFit();
 *   SmartBPanZoom.getPan();  // { panX, panY, zoom }
 *   SmartBPanZoom.setPan(px, py);
 */
(function() {
    'use strict';

    // ── State ──
    var zoom = 1;
    var panX = 0, panY = 0;
    var isPanning = false;
    var panStarted = false; // true once movement exceeds threshold
    var panStartX = 0, panStartY = 0;
    var panStartPanX = 0, panStartPanY = 0;

    // ── Movement threshold to prevent false pans on click ──
    var PAN_THRESHOLD = 3; // pixels

    // ── DOM refs (queried once at load time -- these elements are static) ──
    var previewPanel = document.getElementById('previewPanel');
    var container = document.getElementById('preview-container');

    // ── Transform ──
    function applyTransform() {
        var preview = document.getElementById('preview');
        preview.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoom + ')';
    }

    // ── Mouse wheel zoom (trackpad-friendly: uses deltaY magnitude) ──
    container.addEventListener('wheel', function(e) {
        e.preventDefault();
        // Clamp deltaY so trackpad inertia doesn't over-zoom
        var clamped = Math.max(-60, Math.min(60, e.deltaY));
        var factor = 1 - clamped * 0.002; // ~0.12% per pixel of delta
        var newZoom = Math.min(Math.max(zoom * factor, 0.1), 5);

        // Zoom toward cursor
        var rect = container.getBoundingClientRect();
        var mx = e.clientX - rect.left;
        var my = e.clientY - rect.top;

        panX = mx - (mx - panX) * (newZoom / zoom);
        panY = my - (my - panY) * (newZoom / zoom);
        zoom = newZoom;

        applyTransform();
        document.getElementById('zoomLabel').textContent = Math.round(zoom * 100) + '%';
    }, { passive: false });

    // ── Mouse drag pan (disabled in flag mode, editor mode, and FSM blocking states) ──
    container.addEventListener('mousedown', function(e) {
        if (e.button !== 0) return;

        // Auto-recover: if FSM says we're in a blocking state but no actual overlay exists, reset
        if (window.SmartBInteraction) {
            var fsmState = SmartBInteraction.getState();
            if (fsmState === 'editing' && !(window.SmartBInlineEdit && SmartBInlineEdit.isActive())) {
                SmartBInteraction.forceState('idle');
            }
            if (fsmState === 'context-menu' && !document.querySelector('.context-menu')) {
                SmartBInteraction.forceState('idle');
            }
            if (fsmState === 'dragging' && !(window.SmartBNodeDrag && SmartBNodeDrag.isDragging())) {
                SmartBInteraction.forceState('idle');
            }
        }

        // Check FSM blocking states (editing, context-menu)
        if (window.SmartBInteraction && SmartBInteraction.isBlocking()) return;
        if (window.SmartBInteraction && SmartBInteraction.getState() === 'dragging') return;
        // Don't pan if clicking on a selected node (node-drag handles this)
        if (window.SmartBInteraction && SmartBInteraction.getState() === 'selected') {
            var sel = window.SmartBSelection ? SmartBSelection.getSelected() : null;
            if (sel && sel.type === 'node') {
                var clickedNode = window.DiagramDOM ? DiagramDOM.extractNodeId(e.target) : null;
                if (clickedNode && clickedNode.id === sel.id) return; // Let node-drag handle it
            }
        }
        // Keep existing checks for backward compat without FSM
        if (window.SmartBAnnotations && SmartBAnnotations.getState().flagMode) return;
        if (window.MmdEditor && MmdEditor.getState().mode) return;
        isPanning = true;
        panStarted = false;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panStartPanX = panX;
        panStartPanY = panY;
    });

    document.addEventListener('mousemove', function(e) {
        if (!isPanning) return;

        // Movement threshold: only start actual panning after PAN_THRESHOLD pixels
        if (!panStarted) {
            var dx = Math.abs(e.clientX - panStartX);
            var dy = Math.abs(e.clientY - panStartY);
            if (dx <= PAN_THRESHOLD && dy <= PAN_THRESHOLD) return;
            // Threshold crossed: pan starts now
            panStarted = true;
            previewPanel.classList.add('grabbing');
            // Notify FSM
            if (window.SmartBInteraction) SmartBInteraction.transition('pan_start');
        }

        panX = panStartPanX + (e.clientX - panStartX);
        panY = panStartPanY + (e.clientY - panStartY);
        applyTransform();
    });

    document.addEventListener('mouseup', function() {
        if (isPanning && panStarted) {
            // Notify FSM that pan ended
            if (window.SmartBInteraction) {
                var sel = SmartBInteraction.getSelection();
                SmartBInteraction.transition(sel.id ? 'pan_end_selected' : 'pan_end');
            }
            previewPanel.classList.remove('grabbing');
        }
        isPanning = false;
        panStarted = false;
    });

    // ── Zoom Fit ──
    function zoomFit() {
        var svg = document.querySelector('#preview svg');
        if (!svg) return;
        var rect = container.getBoundingClientRect();
        var vb = svg.viewBox && svg.viewBox.baseVal;
        var svgW = (vb && vb.width) || svg.getBoundingClientRect().width / zoom;
        var svgH = (vb && vb.height) || svg.getBoundingClientRect().height / zoom;

        if (svgW <= 0 || svgH <= 0) return;

        var padFraction = 0.92;
        var scaleX = (rect.width * padFraction) / svgW;
        var scaleY = (rect.height * padFraction) / svgH;
        zoom = Math.min(scaleX, scaleY, 2.5);

        var scaledW = svgW * zoom;
        var scaledH = svgH * zoom;
        panX = (rect.width - scaledW) / 2;
        panY = (rect.height - scaledH) / 2;

        applyTransform();
        document.getElementById('zoomLabel').textContent = Math.round(zoom * 100) + '%';
    }

    // ── Zoom buttons (zoom toward viewport center, preserving pan position) ──
    function zoomIn() {
        var newZoom = Math.min(zoom * 1.15, 5);
        var rect = container.getBoundingClientRect();
        var cx = rect.width / 2;
        var cy = rect.height / 2;
        panX = cx - (cx - panX) * (newZoom / zoom);
        panY = cy - (cy - panY) * (newZoom / zoom);
        zoom = newZoom;
        applyTransform();
        document.getElementById('zoomLabel').textContent = Math.round(zoom * 100) + '%';
    }

    function zoomOut() {
        var newZoom = Math.max(zoom * 0.85, 0.1);
        var rect = container.getBoundingClientRect();
        var cx = rect.width / 2;
        var cy = rect.height / 2;
        panX = cx - (cx - panX) * (newZoom / zoom);
        panY = cy - (cy - panY) * (newZoom / zoom);
        zoom = newZoom;
        applyTransform();
        document.getElementById('zoomLabel').textContent = Math.round(zoom * 100) + '%';
    }

    // ── Public API ──
    window.SmartBPanZoom = {
        getZoom: function() { return zoom; },
        getPan: function() { return { panX: panX, panY: panY, zoom: zoom }; },
        setPan: function(px, py) { panX = px; panY = py; applyTransform(); },
        applyTransform: applyTransform,
        zoomIn: zoomIn,
        zoomOut: zoomOut,
        zoomFit: zoomFit,
    };

    // Backward compat -- inline onclick handlers and keyboard shortcuts call these directly
    window.zoomIn = zoomIn;
    window.zoomOut = zoomOut;
    window.zoomFit = zoomFit;
    window.applyTransform = applyTransform;
})();
