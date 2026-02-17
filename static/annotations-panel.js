/**
 * SmartB Annotations Panel -- Panel rendering and navigation for flags.
 * Extracted from annotations.js. Exposed as window.SmartBAnnotationsPanel.
 * Dependencies: diagram-dom.js, pan-zoom.js
 */
(function () {
    'use strict';

    function renderPanel(state, hooks, removeFlagFn) {
        var list = document.getElementById('flagPanelList');
        if (!list) return;
        var count = document.getElementById('flagPanelCount');
        if (count) {
            count.textContent = state.flags.size;
            count.dataset.count = state.flags.size;
            count.style.display = state.flags.size > 0 ? '' : 'none';
        }
        if (state.flags.size === 0) {
            var emptyDiv = document.createElement('div');
            emptyDiv.className = 'flag-panel-empty';
            emptyDiv.textContent = 'Nenhuma flag ativa. Ative o Flag Mode (F) e clique em um nodo para sinalizar.';
            list.textContent = '';
            list.appendChild(emptyDiv);
            return;
        }
        list.textContent = '';

        // Show current file name as context
        var currentFile = hooks.getCurrentFile();
        if (currentFile) {
            var fileDiv = document.createElement('div');
            fileDiv.className = 'flag-panel-file';
            fileDiv.textContent = currentFile;
            list.appendChild(fileDiv);
        }

        for (var entry of state.flags) {
            var nodeId = entry[0];
            var message = entry[1].message;
            var item = document.createElement('div');
            item.className = 'flag-panel-item';
            item.dataset.nodeId = nodeId;

            var topRow = document.createElement('div');
            topRow.className = 'flag-panel-item-top';

            var idDiv = document.createElement('div');
            idDiv.className = 'flag-panel-item-id';
            idDiv.textContent = nodeId;
            topRow.appendChild(idDiv);

            var btnDelete = document.createElement('button');
            btnDelete.className = 'flag-panel-item-delete';
            btnDelete.title = 'Remover flag';
            /* safe: SmartBIcons contains static trusted SVG strings */
            btnDelete.innerHTML = SmartBIcons.close;
            btnDelete.addEventListener('click', (function(nid) {
                return function(e) {
                    e.stopPropagation();
                    removeFlagFn(nid);
                };
            })(nodeId));
            topRow.appendChild(btnDelete);

            item.appendChild(topRow);

            var msgDiv = document.createElement('div');
            msgDiv.className = 'flag-panel-item-msg';
            if (message) {
                msgDiv.textContent = message;
            } else {
                msgDiv.style.fontStyle = 'italic';
                msgDiv.textContent = '(sem nota)';
            }
            item.appendChild(msgDiv);
            item.addEventListener('click', (function(nid) {
                return function() { scrollToNode(nid); };
            })(nodeId));
            list.appendChild(item);
        }
    }

    function scrollToNode(nodeId) {
        var el = DiagramDOM.findNodeElement(nodeId) || DiagramDOM.findSubgraphElement(nodeId);
        if (!el) { var svg = DiagramDOM.getSVG(); if (svg) el = svg.querySelector('[id="' + CSS.escape(nodeId) + '"]'); }
        if (!el) return;
        // Pan to center the node in the viewport
        if (window.SmartBPanZoom) {
            var container = document.getElementById('preview-container');
            if (container) {
                var rect = el.getBoundingClientRect();
                var containerRect = container.getBoundingClientRect();
                var pan = SmartBPanZoom.getPan();
                var centerX = containerRect.width / 2;
                var centerY = containerRect.height / 2;
                var elCenterX = rect.left + rect.width / 2 - containerRect.left;
                var elCenterY = rect.top + rect.height / 2 - containerRect.top;
                SmartBPanZoom.setPan(pan.panX + (centerX - elCenterX), pan.panY + (centerY - elCenterY));
            }
        }
        flashElement(el);
    }

    function flashElement(el) {
        el.style.transition = 'opacity 0.15s'; el.style.opacity = '0.3';
        setTimeout(function() { el.style.opacity = '1'; }, 150);
        setTimeout(function() { el.style.opacity = '0.3'; }, 300);
        setTimeout(function() { el.style.opacity = '1'; el.style.transition = ''; }, 450);
    }

    function updateBadge(flagCount) {
        var badge = document.getElementById('flagCountBadge');
        if (badge) {
            badge.textContent = flagCount || '';
            badge.dataset.count = flagCount;
        }
    }

    function togglePanel(state) {
        state.panelOpen = !state.panelOpen;
        var panel = document.getElementById('flagPanel');
        if (panel) panel.classList.toggle('hidden', !state.panelOpen);
        if (window.zoomFit) setTimeout(window.zoomFit, 100);
    }

    window.SmartBAnnotationsPanel = {
        renderPanel: renderPanel,
        scrollToNode: scrollToNode,
        flashElement: flashElement,
        updateBadge: updateBadge,
        togglePanel: togglePanel,
    };
})();
