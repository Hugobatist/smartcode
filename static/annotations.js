/**
 * SmartB Annotations -- Flag, Status, Breakpoint, Risk annotation system.
 * Dependencies: diagram-dom.js, event-bus.js. Exposed as window.SmartBAnnotations
 */
(function () {
    'use strict';

    const ANNOTATION_START = '%% --- ANNOTATIONS (auto-managed by SmartB Diagrams) ---';
    const ANNOTATION_END = '%% --- END ANNOTATIONS ---';
    const FLAG_REGEX = /^%%\s*@flag\s+(\S+)\s+"([^"]*)"$/;
    const STATUS_REGEX = /^%%\s*@status\s+(\S+)\s+(\S+)$/;
    const BREAKPOINT_REGEX = /^%%\s*@breakpoint\s+(\S+)$/;
    const RISK_REGEX = /^%%\s*@risk\s+(\S+)\s+(high|medium|low)\s+"([^"]*)"$/;

    const state = {
        flagMode: false,
        flags: new Map(),      // nodeId -> { message, timestamp }
        statuses: new Map(),   // nodeId -> statusValue string
        breakpoints: new Set(), // nodeId set
        risks: new Map(),      // nodeId -> { level, reason }
        panelOpen: false, popover: null,
        popoverOutsideHandler: null, // stored ref to remove on close
    };

    let hooks = {
        getEditor: () => document.getElementById('editor'),
        getCurrentFile: () => window.currentFile || '',
        getLastContent: () => window.lastContent || '',
        setLastContent: (v) => { window.lastContent = v; },
        saveFile: null,
        renderDiagram: null,
    };

    // ── Parsing & Serialization ──

    function parseAnnotations(content) {
        const flags = new Map(), statuses = new Map(), breakpoints = new Set(), risks = new Map();
        const lines = content.split('\n');
        let inBlock = false;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed === ANNOTATION_START) { inBlock = true; continue; }
            if (trimmed === ANNOTATION_END) { inBlock = false; continue; }
            if (inBlock) {
                const fm = trimmed.match(FLAG_REGEX);
                if (fm) { flags.set(fm[1], { message: fm[2], timestamp: Date.now() }); continue; }
                const sm = trimmed.match(STATUS_REGEX);
                if (sm) { statuses.set(sm[1], sm[2]); continue; }
                const bm = trimmed.match(BREAKPOINT_REGEX);
                if (bm) { breakpoints.add(bm[1]); continue; }
                const rm = trimmed.match(RISK_REGEX);
                if (rm) { risks.set(rm[1], { level: rm[2], reason: rm[3] }); }
            }
        }
        return { flags, statuses, breakpoints, risks };
    }

    function stripAnnotations(content) {
        const lines = content.split('\n'), result = [];
        let inBlock = false;
        for (const line of lines) {
            const t = line.trim();
            if (t === ANNOTATION_START) { inBlock = true; continue; }
            if (t === ANNOTATION_END) { inBlock = false; continue; }
            if (!inBlock) result.push(line);
        }
        while (result.length > 0 && result[result.length - 1].trim() === '') result.pop();
        return result.join('\n');
    }

    function injectAnnotations(content, flags, statuses) {
        const clean = stripAnnotations(content), statusMap = statuses || state.statuses;
        const hasAnnotations = flags.size > 0 || statusMap.size > 0 || state.breakpoints.size > 0 || state.risks.size > 0;
        if (!hasAnnotations) return clean;
        const lines = ['', ANNOTATION_START];
        for (const [nid, { message }] of flags) lines.push('%% @flag ' + nid + ' "' + message.replace(/"/g, "''") + '"');
        for (const [nid, sv] of statusMap) lines.push('%% @status ' + nid + ' ' + sv);
        for (const nid of state.breakpoints) lines.push('%% @breakpoint ' + nid);
        for (const [nid, { level, reason }] of state.risks) lines.push('%% @risk ' + nid + ' ' + level + ' "' + reason.replace(/"/g, "''") + '"');
        lines.push(ANNOTATION_END);
        return clean + '\n' + lines.join('\n');
    }

    function getCleanContent(content) { return stripAnnotations(content); }

    // ── SVG Post-processing (uses DiagramDOM) ──

    function applyFlagsToSVG() {
        const svg = DiagramDOM.getSVG();
        if (!svg) return;
        svg.querySelectorAll('.flag-badge').forEach(function(b) { b.remove(); });
        svg.querySelectorAll('.flagged, .flagged-edge').forEach(function(el) {
            el.classList.remove('flagged', 'flagged-edge');
        });
        if (state.flags.size === 0) return;

        for (const [nodeId] of state.flags) {
            // Use DiagramDOM to find node and subgraph elements
            var nodeEl = DiagramDOM.findNodeElement(nodeId);
            if (nodeEl) {
                nodeEl.classList.add('flagged');
                addBadge(svg, nodeEl, nodeId);
                continue;
            }
            var subEl = DiagramDOM.findSubgraphElement(nodeId);
            if (subEl) {
                subEl.classList.add('flagged');
                addBadge(svg, subEl, nodeId);
                continue;
            }
            // Edge flags: check if ID starts with L- (Mermaid) or direct data-edge-id (custom)
            if (nodeId.startsWith('L-')) {
                var edgeEl = svg.querySelector('[id="' + nodeId + '"]');
                if (!edgeEl) {
                    var bareEdgeId = nodeId.substring(2);
                    edgeEl = svg.querySelector('[data-edge-id="' + bareEdgeId + '"]');
                }
                if (edgeEl) {
                    edgeEl.classList.add('flagged-edge');
                    addBadge(svg, edgeEl, nodeId);
                }
            } else {
                var directEdge = svg.querySelector('[data-edge-id="' + nodeId + '"]');
                if (directEdge) {
                    directEdge.classList.add('flagged-edge');
                    addBadge(svg, directEdge, nodeId);
                }
            }
        }
    }

    function svgEl(ns, tag, attrs) {
        var el = document.createElementNS(ns, tag);
        Object.entries(attrs).forEach(function(p) { el.setAttribute(p[0], p[1]); });
        return el;
    }

    function addBadge(svg, element, nodeId) {
        const bbox = element.getBBox ? element.getBBox() : null;
        if (!bbox) return;
        const ns = 'http://www.w3.org/2000/svg';

        // Account for transform="translate(x,y)" on custom renderer nodes
        var tx = 0, ty = 0;
        var transform = element.getAttribute('transform');
        if (transform) {
            var m = transform.match(/translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
            if (m) { tx = parseFloat(m[1]); ty = parseFloat(m[2]); }
        }

        const g = svgEl(ns, 'g', { 'class': 'flag-badge' });
        const cx = tx + bbox.x + bbox.width - 2, cy = ty + bbox.y + 2;

        g.appendChild(svgEl(ns, 'circle', { cx: cx, cy: cy, r: 12, fill: '#ef4444', stroke: '#fff', 'stroke-width': 2 }));
        var bang = svgEl(ns, 'text', { x: cx, y: cy + 1, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#fff', 'font-size': 13, 'font-weight': 700, 'font-family': 'Inter, sans-serif' });
        bang.textContent = '!';
        g.appendChild(bang);

        // Flag message label with measured background
        var flagData = nodeId ? state.flags.get(nodeId) : null;
        if (flagData && flagData.message) {
            var msg = flagData.message.length > 35 ? flagData.message.substring(0, 34) + '\u2026' : flagData.message;
            var label = svgEl(ns, 'text', { x: cx, y: cy + 24, 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#fff', 'font-size': 10, 'font-weight': 600, 'font-family': "'JetBrains Mono', Inter, sans-serif" });
            label.textContent = msg;
            // Measure text by temporarily appending
            g.appendChild(label);
            svg.appendChild(g);
            var tBox = label.getBBox();
            svg.removeChild(g);
            g.removeChild(label);
            // Background pill
            var padX = 8, padY = 3;
            g.appendChild(svgEl(ns, 'rect', { x: tBox.x - padX, y: tBox.y - padY, width: tBox.width + padX * 2, height: tBox.height + padY * 2, rx: 8, fill: '#ef4444', opacity: '0.95' }));
            g.appendChild(label);
            var title = document.createElementNS(ns, 'title');
            title.textContent = 'Flag: ' + flagData.message;
            g.appendChild(title);
        }
        svg.appendChild(g);
    }

    // ── Popover ──

    function closePopover() {
        if (state.popoverOutsideHandler) {
            document.removeEventListener('mousedown', state.popoverOutsideHandler);
            state.popoverOutsideHandler = null;
        }
        if (state.popover) { state.popover.remove(); state.popover = null; }
    }

    function showPopover(nodeInfo, clientX, clientY) {
        closePopover();
        var existing = state.flags.get(nodeInfo.id);
        var isExisting = !!existing;
        var isNode = nodeInfo.type === 'node' || nodeInfo.type === 'subgraph';
        var pop = document.createElement('div');
        pop.className = 'flag-popover';
        pop.style.left = Math.min(clientX + 12, window.innerWidth - 380) + 'px';
        pop.style.top = Math.min(clientY - 20, window.innerHeight - 320) + 'px';

        var typeLabel = nodeInfo.type === 'edge' ? 'Conexao' : nodeInfo.type === 'subgraph' ? 'Subgrafo' : 'Nodo';
        var hasMmdEditor = !!window.MmdEditor;

        // Build popover content using DOM methods for safety
        var titleDiv = document.createElement('div');
        titleDiv.className = 'flag-popover-title';
        var titleSpan = document.createElement('span');
        titleSpan.textContent = isExisting ? 'Editar Flag' : 'Sinalizar ' + typeLabel;
        titleDiv.appendChild(titleSpan);
        var idSpan = document.createElement('span');
        idSpan.className = 'node-id';
        idSpan.textContent = nodeInfo.id;
        titleDiv.appendChild(idSpan);
        pop.appendChild(titleDiv);

        var textarea = document.createElement('textarea');
        textarea.className = 'flag-note';
        textarea.placeholder = 'Descreva o problema (opcional)...';
        textarea.value = isExisting ? existing.message : '';
        pop.appendChild(textarea);

        if (hasMmdEditor) {
            var corrDiv = document.createElement('div');
            corrDiv.className = 'correction-actions';
            var corrLabel = document.createElement('span');
            corrLabel.style.cssText = 'font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:1px';
            corrLabel.textContent = 'Correcoes';
            corrDiv.appendChild(corrLabel);
            var btnsDiv = document.createElement('div');
            btnsDiv.className = 'correction-btns';
            if (isNode) {
                var btnEditText = document.createElement('button');
                btnEditText.className = 'btn-correction';
                btnEditText.dataset.action = 'edit-text';
                btnEditText.title = 'Editar texto do nodo';
                btnEditText.textContent = 'Editar Texto';
                btnsDiv.appendChild(btnEditText);
                var btnConnect = document.createElement('button');
                btnConnect.className = 'btn-correction';
                btnConnect.dataset.action = 'connect-from';
                btnConnect.title = 'Criar nova seta a partir deste nodo';
                btnConnect.textContent = 'Nova Seta \u2192';
                btnsDiv.appendChild(btnConnect);
            }
            var btnDelete = document.createElement('button');
            btnDelete.className = 'btn-correction btn-correction-danger';
            btnDelete.dataset.action = 'delete';
            btnDelete.title = 'Remover ' + typeLabel.toLowerCase() + ' do diagrama';
            btnDelete.textContent = 'Remover ' + typeLabel;
            btnsDiv.appendChild(btnDelete);
            corrDiv.appendChild(btnsDiv);
            pop.appendChild(corrDiv);
        }

        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'flag-popover-actions';
        if (isExisting) {
            var btnRemove = document.createElement('button');
            btnRemove.className = 'btn-flag remove';
            btnRemove.dataset.action = 'remove-flag';
            btnRemove.textContent = 'Remover Flag';
            actionsDiv.appendChild(btnRemove);
        }
        var btnCancel = document.createElement('button');
        btnCancel.className = 'btn-flag secondary';
        btnCancel.dataset.action = 'cancel';
        btnCancel.textContent = 'Cancelar';
        actionsDiv.appendChild(btnCancel);
        var btnFlag = document.createElement('button');
        btnFlag.className = 'btn-flag primary';
        btnFlag.dataset.action = 'flag';
        btnFlag.textContent = isExisting ? 'Atualizar' : 'Sinalizar';
        actionsDiv.appendChild(btnFlag);
        pop.appendChild(actionsDiv);

        document.body.appendChild(pop);
        state.popover = pop;
        textarea.focus();

        textarea.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doFlag(nodeInfo, textarea.value.trim()); }
            if (e.key === 'Escape') closePopover();
        });

        pop.addEventListener('click', function(e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            var action = btn.dataset.action;
            if (action === 'cancel') closePopover();
            else if (action === 'flag') doFlag(nodeInfo, textarea.value.trim());
            else if (action === 'remove-flag') removeFlag(nodeInfo.id);
            else if (action === 'delete') { closePopover(); MmdEditor.doRemoveNode(nodeInfo.id); }
            else if (action === 'edit-text') { closePopover(); MmdEditor.doEditNodeText(nodeInfo.id); }
            else if (action === 'connect-from') { closePopover(); MmdEditor.startConnectFrom(nodeInfo.id); }
        });

        setTimeout(function() {
            function outsideClick(e) {
                if (pop.contains(e.target)) return;
                closePopover();
            }
            state.popoverOutsideHandler = outsideClick;
            document.addEventListener('mousedown', outsideClick);
        }, 50);
    }

    // ── Flag Operations ──

    function doFlag(nodeInfo, message) {
        state.flags.set(nodeInfo.id, { message: message, timestamp: Date.now() });
        closePopover();
        onFlagsChanged();
    }

    function removeFlag(nodeId) {
        state.flags.delete(nodeId);
        closePopover();
        onFlagsChanged();
    }

    async function onFlagsChanged() {
        var editor = hooks.getEditor();
        if (!editor) return;
        var newContent = injectAnnotations(editor.value, state.flags, state.statuses);
        editor.value = newContent;
        hooks.setLastContent(newContent);
        if (hooks.saveFile) await hooks.saveFile();
        applyFlagsToSVG();
        renderPanel();
        updateBadge();
        // Emit flags:changed via event bus
        if (window.SmartBEventBus) {
            SmartBEventBus.emit('flags:changed', { flags: state.flags, statuses: state.statuses });
        }
    }

    // ── Flags Panel ──

    function renderPanel() {
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
            btnDelete.textContent = '\u00d7';
            btnDelete.addEventListener('click', (function(nid) {
                return function(e) {
                    e.stopPropagation();
                    removeFlag(nid);
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

    function updateBadge() {
        var badge = document.getElementById('flagCountBadge');
        if (badge) {
            badge.textContent = state.flags.size || '';
            badge.dataset.count = state.flags.size;
        }
    }

    // ── Merge (auto-sync preserves user flags) ──

    function mergeIncomingContent(incomingContent) {
        var incoming = parseAnnotations(incomingContent);
        var mergedFlags = new Map(incoming.flags);
        for (var entry of state.flags) mergedFlags.set(entry[0], entry[1]);
        state.flags = mergedFlags;
        // Merge statuses: incoming wins for new keys, preserve user-set statuses
        var mergedStatuses = new Map(incoming.statuses);
        for (var sEntry of state.statuses) mergedStatuses.set(sEntry[0], sEntry[1]);
        state.statuses = mergedStatuses;
        // Merge breakpoints and risks
        state.breakpoints = new Set([...incoming.breakpoints, ...state.breakpoints]);
        if (window.SmartBBreakpoints) SmartBBreakpoints.updateBreakpoints(state.breakpoints);
        var mergedRisks = new Map(incoming.risks);
        for (var rEntry of state.risks) mergedRisks.set(rEntry[0], rEntry[1]);
        state.risks = mergedRisks;
        if (window.SmartBHeatmap) SmartBHeatmap.updateRisks(state.risks);
        var cleanIncoming = stripAnnotations(incomingContent);
        return injectAnnotations(cleanIncoming, mergedFlags, mergedStatuses);
    }

    // ── Click Handler (flag mode) — uses DiagramDOM.extractNodeId ──

    function handlePreviewClick(e) {
        if (!state.flagMode) return;
        if (e.target.closest('.zoom-controls') || e.target.closest('.flag-popover')) return;
        var nodeInfo = DiagramDOM.extractNodeId(e.target);
        if (!nodeInfo) return;
        e.preventDefault();
        e.stopPropagation();
        showPopover(nodeInfo, e.clientX, e.clientY);
    }

    // ── Flag Mode Toggle ──

    function toggleFlagMode() {
        state.flagMode = !state.flagMode;
        document.body.classList.toggle('flag-mode', state.flagMode);
        var btn = document.getElementById('btnFlags');
        if (btn) btn.classList.toggle('active', state.flagMode);
        if (!state.flagMode) closePopover();
        if (window.toast) window.toast(state.flagMode ? 'Flag Mode ON — clique em um nodo' : 'Flag Mode OFF');
    }

    function togglePanel() {
        state.panelOpen = !state.panelOpen;
        var panel = document.getElementById('flagPanel');
        if (panel) panel.classList.toggle('hidden', !state.panelOpen);
        if (window.zoomFit) setTimeout(window.zoomFit, 100);
    }

    // ── Init ──

    function init(options) {
        if (options) Object.assign(hooks, options);
        var editor = hooks.getEditor();
        if (editor && editor.value) {
            var parsed = parseAnnotations(editor.value);
            state.flags = parsed.flags;
            state.statuses = parsed.statuses;
            state.breakpoints = parsed.breakpoints;
            state.risks = parsed.risks;
            if (window.SmartBBreakpoints) SmartBBreakpoints.updateBreakpoints(parsed.breakpoints);
            if (window.SmartBHeatmap) SmartBHeatmap.updateRisks(parsed.risks);
        }
        var container = document.getElementById('preview-container');
        if (container) container.addEventListener('click', handlePreviewClick);
        renderPanel();
        updateBadge();

        // Subscribe to event bus: re-apply flags after each diagram render
        if (window.SmartBEventBus) {
            SmartBEventBus.on('diagram:rendered', function() {
                applyFlagsToSVG();
            });
        }
    }

    // ── Status Operations ──

    function getStatusMap() {
        return state.statuses;
    }

    function setStatus(nodeId, statusValue) {
        state.statuses.set(nodeId, statusValue);
        onFlagsChanged();
    }

    function removeStatus(nodeId) {
        state.statuses.delete(nodeId);
        onFlagsChanged();
    }

    // ── Public API ──

    window.SmartBAnnotations = {
        init: init, getState: function() { return state; },
        parseAnnotations: parseAnnotations, stripAnnotations: stripAnnotations,
        injectAnnotations: injectAnnotations, getCleanContent: getCleanContent,
        applyFlagsToSVG: applyFlagsToSVG, mergeIncomingContent: mergeIncomingContent,
        toggleFlagMode: toggleFlagMode, togglePanel: togglePanel,
        renderPanel: renderPanel, updateBadge: updateBadge,
        extractNodeId: function(element) { return DiagramDOM.extractNodeId(element); },
        closePopover: closePopover, getRisks: function() { return state.risks; },
        getStatusMap: getStatusMap, setStatus: setStatus, removeStatus: removeStatus,
    };
})();
