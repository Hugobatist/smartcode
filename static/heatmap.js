/**
 * SmartB Heatmap -- risk overlay coloring and execution frequency heatmap.
 * Colors nodes by risk level (red/yellow/green) or frequency (cold blue to hot red).
 * Dependencies: diagram-dom.js, event-bus.js, file-tree.js
 */
var SmartBHeatmap = (function() {
    'use strict';

    var RISK_COLORS = {
        high:   { fill: '#ef4444', opacity: 0.75 },
        medium: { fill: '#eab308', opacity: 0.60 },
        low:    { fill: '#22c55e', opacity: 0.50 },
    };

    var state = {
        active: false,
        mode: 'risk', // 'risk' or 'frequency'
        risks: new Map(),
        visitCounts: {},
        savedFills: new Map(),
    };

    function intensityToColor(t) {
        var r = Math.round(66 + 189 * t);
        var g = Math.round(133 - 53 * t);
        var b = Math.round(244 - 244 * t);
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    function findShape(nodeEl) {
        if (!nodeEl) return null;
        var shape = nodeEl.querySelector('rect, polygon, circle, path, ellipse');
        if (!shape) {
            var childG = nodeEl.querySelector('g');
            if (childG) shape = childG.querySelector('rect, polygon, circle, path, ellipse');
        }
        return shape;
    }

    function getNodeId(nodeEl, idx) {
        return nodeEl.getAttribute('data-node-id') || nodeEl.getAttribute('id') || String(idx);
    }

    function saveFills() {
        state.savedFills.clear();
        var nodes = DiagramDOM.getAllNodeElements();
        for (var i = 0; i < nodes.length; i++) {
            var shape = findShape(nodes[i]);
            if (!shape) continue;
            state.savedFills.set(getNodeId(nodes[i], i), {
                fill: shape.getAttribute('fill') || '',
                fillOpacity: shape.getAttribute('fill-opacity') || '',
            });
        }
    }

    function restoreFills() {
        var nodes = DiagramDOM.getAllNodeElements();
        for (var i = 0; i < nodes.length; i++) {
            var shape = findShape(nodes[i]);
            if (!shape) continue;
            var saved = state.savedFills.get(getNodeId(nodes[i], i));
            if (saved) {
                if (saved.fill) shape.setAttribute('fill', saved.fill);
                else shape.removeAttribute('fill');
                if (saved.fillOpacity) shape.setAttribute('fill-opacity', saved.fillOpacity);
                else shape.removeAttribute('fill-opacity');
            }
        }
        state.savedFills.clear();
    }

    function applyRiskOverlay() {
        if (state.risks.size === 0) return;
        state.risks.forEach(function(risk, nodeId) {
            var shape = findShape(DiagramDOM.findNodeElement(nodeId));
            if (!shape) return;
            var colors = RISK_COLORS[risk.level || risk];
            if (!colors) return;
            shape.setAttribute('fill', colors.fill);
            shape.setAttribute('fill-opacity', String(colors.opacity));
        });
    }

    function applyFrequencyHeatmap() {
        var counts = state.visitCounts;
        var keys = Object.keys(counts);
        if (keys.length === 0) return;
        var max = 0;
        for (var k = 0; k < keys.length; k++) {
            if (counts[keys[k]] > max) max = counts[keys[k]];
        }
        if (max === 0) return;
        for (var j = 0; j < keys.length; j++) {
            var shape = findShape(DiagramDOM.findNodeElement(keys[j]));
            if (!shape) continue;
            var intensity = counts[keys[j]] / max;
            shape.setAttribute('fill', intensityToColor(intensity));
            shape.setAttribute('fill-opacity', String(0.4 + intensity * 0.5));
        }
    }

    function applyCurrent() {
        if (state.mode === 'frequency' && Object.keys(state.visitCounts).length > 0) {
            applyFrequencyHeatmap();
        } else {
            applyRiskOverlay();
        }
        updateLegend();
    }

    function createEl(tag, cls, text) {
        var el = document.createElement(tag);
        if (cls) el.className = cls;
        if (text) el.textContent = text;
        return el;
    }

    function updateLegend() {
        var existing = document.querySelector('.heatmap-legend');
        if (existing) existing.remove();
        if (!state.active) return;
        var container = document.getElementById('preview-container');
        if (!container) return;
        var legend = createEl('div', 'heatmap-legend');
        if (state.mode === 'frequency') {
            legend.appendChild(createEl('div', 'heatmap-legend-title', 'Frequency'));
            legend.appendChild(createEl('div', 'heatmap-legend-gradient'));
            var labels = createEl('div', 'heatmap-legend-labels');
            labels.appendChild(createEl('span', null, 'Low'));
            labels.appendChild(createEl('span', null, 'High'));
            legend.appendChild(labels);
        } else {
            legend.appendChild(createEl('div', 'heatmap-legend-title', 'Risk'));
            var levels = [['high','High'],['medium','Medium'],['low','Low']];
            for (var i = 0; i < levels.length; i++) {
                var item = createEl('div', 'heatmap-legend-item');
                var dot = createEl('span', 'heatmap-legend-dot');
                dot.style.background = RISK_COLORS[levels[i][0]].fill;
                item.appendChild(dot);
                item.appendChild(createEl('span', null, levels[i][1]));
                legend.appendChild(item);
            }
        }
        container.appendChild(legend);
    }

    function toggle() {
        var btn = document.getElementById('btnHeatmap');
        if (state.active) {
            restoreFills();
            state.active = false;
            if (btn) btn.classList.remove('active');
            updateLegend();
        } else {
            state.mode = Object.keys(state.visitCounts).length > 0 ? 'frequency' : 'risk';
            saveFills();
            state.active = true;
            if (btn) btn.classList.add('active');
            applyCurrent();
        }
    }

    function updateRisks(risksMap) {
        if (risksMap instanceof Map) {
            state.risks = risksMap;
        } else if (risksMap && typeof risksMap === 'object') {
            state.risks = new Map();
            var keys = Object.keys(risksMap);
            for (var i = 0; i < keys.length; i++) state.risks.set(keys[i], risksMap[keys[i]]);
        }
        if (state.active && state.mode === 'risk') {
            restoreFills(); saveFills(); applyRiskOverlay();
        }
    }

    function updateVisitCounts(counts) {
        state.visitCounts = counts || {};
        if (state.active) {
            state.mode = 'frequency';
            restoreFills(); saveFills(); applyFrequencyHeatmap(); updateLegend();
        }
    }

    function setMode(newMode) {
        if (newMode !== 'risk' && newMode !== 'frequency') return;
        state.mode = newMode;
        if (state.active) { restoreFills(); saveFills(); applyCurrent(); }
    }

    function onDiagramRendered() {
        if (!state.active) return;
        state.savedFills.clear();
        saveFills();
        applyCurrent();
    }

    function init() {
        if (window.SmartBEventBus) {
            SmartBEventBus.on('diagram:rendered', onDiagramRendered);
        }
        var file = window.SmartBFileTree ? SmartBFileTree.getCurrentFile() : '';
        if (file) {
            fetch('/api/heatmap/' + encodeURIComponent(file))
                .then(function(r) { return r.ok ? r.json() : null; })
                .then(function(data) { if (data) updateVisitCounts(data); })
                .catch(function() {});
        }
    }

    return {
        init: init, toggle: toggle,
        updateRisks: updateRisks, updateVisitCounts: updateVisitCounts,
        setMode: setMode, isActive: function() { return state.active; },
        applyRiskOverlay: applyRiskOverlay,
    };
})();
